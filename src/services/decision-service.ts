import type { SupabaseClient } from "@supabase/supabase-js";

import { getDecisionHistoryForAgendaItem } from "@/lib/decisions";
import { NotFoundError } from "@/lib/errors";
import {
  decisionActionSchema,
  decisionInputSchema,
  decisionUpdateSchema,
} from "@/lib/validation";
import { AgendaItemRepository } from "@/repositories/agenda-item-repository";
import { CommitteeRepository } from "@/repositories/committee-repository";
import { DecisionRepository } from "@/repositories/decision-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

export class DecisionService {
  private readonly decisions: DecisionRepository;
  private readonly committees: CommitteeRepository;
  private readonly meetings: MeetingRepository;
  private readonly agendaItems: AgendaItemRepository;
  private readonly members: OrganizationMemberRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.decisions = new DecisionRepository(db);
    this.committees = new CommitteeRepository(db);
    this.meetings = new MeetingRepository(db);
    this.agendaItems = new AgendaItemRepository(db);
    this.members = new OrganizationMemberRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async getRegister(organizationId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationMember(organizationId, user.id);
    const [decisions, committees, meetings, agendaItems, members] =
      await Promise.all([
        this.decisions.listByOrganization(organizationId),
        this.committees.listByOrganization(organizationId),
        this.meetings.listByOrganization(organizationId),
        this.agendaItems.listByOrganization(organizationId),
        this.members.listMembers(organizationId),
      ]);

    const editableCommitteeIds = (
      await Promise.all(
        committees.map(async (committee) => {
          try {
            await this.authorization.requireAgendaItemEditor(
              organizationId,
              committee.id,
              user.id,
            );
            return committee.id;
          } catch {
            return null;
          }
        }),
      )
    ).filter((id): id is string => Boolean(id));

    const editableCommitteeIdSet = new Set(editableCommitteeIds);

    return {
      decisions: decisions.map((decision) =>
        editableCommitteeIdSet.has(decision.committee_id)
          ? decision
          : { ...decision, internal_note: null },
      ),
      committees,
      meetings,
      agendaItems,
      members,
      editableCommitteeIds,
    };
  }

  async getMeetingContext(
    organizationId: string,
    committeeId: string,
    meetingId: string,
  ) {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );
    const meeting = await this.meetings.findWithAgenda(meetingId);
    if (
      !meeting ||
      meeting.organization_id !== organizationId ||
      meeting.committee_id !== committeeId
    ) {
      throw new NotFoundError("Mødet");
    }

    const [decisions, organizationDecisions, members] = await Promise.all([
      this.decisions.listByMeeting(meetingId),
      this.decisions.listByOrganization(organizationId),
      this.members.listMembers(organizationId),
    ]);
    const canEdit = await this.authorization
      .requireAgendaItemEditor(organizationId, committeeId, user.id)
      .then(() => true)
      .catch(() => false);
    const committeeDecisions = organizationDecisions.filter(
      (decision) => decision.committee_id === committeeId,
    );
    const historyByAgendaItem = Object.fromEntries(
      meeting.agenda_item_occurrences.flatMap((occurrence) =>
        occurrence.agenda_items
          ? [
              [
                occurrence.agenda_items.id,
                getDecisionHistoryForAgendaItem(
                  committeeDecisions,
                  committeeId,
                  occurrence.agenda_items.id,
                  meeting.starts_at,
                ),
              ],
            ]
          : [],
      ),
    );

    return {
      decisions: decisions.map((decision) =>
        canEdit ? decision : { ...decision, internal_note: null },
      ),
      categorySource: committeeDecisions.map((decision) => ({
        ...decision,
        internal_note: null,
      })),
      historyByAgendaItem: Object.fromEntries(
        Object.entries(historyByAgendaItem).map(([agendaItemId, history]) => [
          agendaItemId,
          {
            categories: history.categories,
            decisions: history.decisions.map((decision) => ({
              ...decision,
              internal_note: null,
            })),
          },
        ]),
      ),
      responsiblePeople: members
        .filter(
          (member) =>
            member.status === "active" &&
            member.committees.some((committee) => committee.id === committeeId),
        )
        .map((member) => ({
          id: member.user_id,
          name: member.full_name || member.email,
        })),
      canEdit,
    };
  }

  async getAgendaItemHistory(
    organizationId: string,
    committeeId: string,
    agendaItemId: string,
  ) {
    const user = await this.auth.requireUser();
    await this.authorization.requireCommitteeMember(
      organizationId,
      committeeId,
      user.id,
    );
    const item = await this.agendaItems.findWithHistory(agendaItemId);
    if (
      !item ||
      item.organization_id !== organizationId ||
      item.committee_id !== committeeId
    ) {
      throw new NotFoundError("Dagsordenspunktet");
    }
    const decisions = await this.decisions.listByOrganization(organizationId);
    const history = getDecisionHistoryForAgendaItem(
      decisions,
      committeeId,
      agendaItemId,
    );
    return {
      categories: history.categories,
      decisions: history.decisions.map((decision) => ({
        ...decision,
        internal_note: null,
      })),
    };
  }

  async create(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = decisionInputSchema.parse(input);
    await this.authorization.requireAgendaItemEditor(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    await this.requireValidReferences(parsed);

    return this.decisions.create({
      organization_id: parsed.organizationId,
      committee_id: parsed.committeeId,
      meeting_id: parsed.meetingId ?? null,
      agenda_item_id: parsed.agendaItemId ?? null,
      title: parsed.title,
      description: parsed.description,
      status: parsed.status,
      responsible_user_id: parsed.responsibleUserId ?? null,
      decision_date: parsed.decisionDate,
      deadline: parsed.deadline ?? null,
      category: parsed.category ?? null,
      internal_note: parsed.internalNote ?? null,
      created_by: user.id,
      updated_by: user.id,
      cancelled_at: parsed.status === "cancelled" ? new Date().toISOString() : null,
    });
  }

  async update(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = decisionUpdateSchema.parse(input);
    const decision = await this.requireDecision(
      parsed.organizationId,
      parsed.decisionId,
    );
    await this.authorization.requireAgendaItemEditor(
      parsed.organizationId,
      parsed.committeeId,
      user.id,
    );
    if (decision.committee_id !== parsed.committeeId) {
      await this.authorization.requireAgendaItemEditor(
        parsed.organizationId,
        decision.committee_id,
        user.id,
      );
    }
    await this.requireValidReferences(parsed);

    return this.decisions.update(parsed.decisionId, {
      committee_id: parsed.committeeId,
      meeting_id: parsed.meetingId ?? null,
      agenda_item_id: parsed.agendaItemId ?? null,
      title: parsed.title,
      description: parsed.description,
      status: parsed.status,
      responsible_user_id: parsed.responsibleUserId ?? null,
      decision_date: parsed.decisionDate,
      deadline: parsed.deadline ?? null,
      category: parsed.category ?? null,
      internal_note: parsed.internalNote ?? null,
      updated_by: user.id,
      cancelled_at: parsed.status === "cancelled" ? new Date().toISOString() : null,
    });
  }

  async performAction(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = decisionActionSchema.parse(input);
    const decision = await this.requireDecision(
      parsed.organizationId,
      parsed.decisionId,
    );
    await this.authorization.requireAgendaItemEditor(
      parsed.organizationId,
      decision.committee_id,
      user.id,
    );

    if (parsed.action === "archive") {
      return this.decisions.update(parsed.decisionId, {
        archived_at: new Date().toISOString(),
        updated_by: user.id,
      });
    }
    return this.decisions.update(parsed.decisionId, {
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_by: user.id,
    });
  }

  private async requireDecision(organizationId: string, decisionId: string) {
    const decision = await this.decisions.findById(decisionId);
    if (!decision || decision.organization_id !== organizationId) {
      throw new NotFoundError("Beslutningen");
    }
    return decision;
  }

  private async requireValidReferences(input: {
    organizationId: string;
    committeeId: string;
    meetingId?: string | null;
    agendaItemId?: string | null;
    responsibleUserId?: string | null;
  }) {
    const [meeting, agendaItem, membership] = await Promise.all([
      input.meetingId
        ? this.meetings.findWithAgenda(input.meetingId)
        : Promise.resolve(null),
      input.agendaItemId
        ? this.agendaItems.findWithHistory(input.agendaItemId)
        : Promise.resolve(null),
      input.responsibleUserId
        ? this.committees.getMembership(
            input.committeeId,
            input.responsibleUserId,
          )
        : Promise.resolve(null),
    ]);

    if (
      input.meetingId &&
      (!meeting ||
        meeting.organization_id !== input.organizationId ||
        meeting.committee_id !== input.committeeId)
    ) {
      throw new NotFoundError("Det valgte møde");
    }
    if (
      input.agendaItemId &&
      (!agendaItem ||
        agendaItem.organization_id !== input.organizationId ||
        agendaItem.committee_id !== input.committeeId)
    ) {
      throw new NotFoundError("Det valgte dagsordenspunkt");
    }
    if (input.responsibleUserId && !membership) {
      throw new NotFoundError("Den ansvarlige");
    }
  }
}
