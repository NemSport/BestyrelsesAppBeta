import type { SupabaseClient } from "@supabase/supabase-js";

import { AppError } from "@/lib/errors";
import { organizationTrashRestoreSchema } from "@/lib/validation";
import { AgendaItemService } from "@/services/agenda-item-service";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { CommitteeService } from "@/services/committee-service";
import { MeetingService } from "@/services/meeting-service";
import { OrganizationService } from "@/services/organization-service";
import { TrashRepository } from "@/repositories/trash-repository";
import type { Database } from "@/types/database";
import type { OrganizationTrashData, OrganizationTrashItem } from "@/types/domain";

export class TrashService {
  private readonly trash: TrashRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.trash = new TrashRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async getOrganizationTrash(organizationId: string): Promise<OrganizationTrashData> {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationAdmin(organizationId, user.id, {
      includeDeleted: true,
    });

    const [organization, committees, meetings, agendaItems] = await Promise.all([
      this.trash.findDeletedOrganization(organizationId),
      this.trash.listDeletedCommittees(organizationId),
      this.trash.listDeletedMeetings(organizationId),
      this.trash.listDeletedAgendaItems(organizationId),
    ]);
    const profiles = await this.trash.listDeletedByProfiles([
      organization?.deleted_by,
      ...committees.map((item) => item.deleted_by),
      ...meetings.map((item) => item.deleted_by),
      ...agendaItems.map((item) => item.deleted_by),
    ].filter((id): id is string => Boolean(id)));

    const now = new Date();
    const items: OrganizationTrashItem[] = [
      ...(organization
        ? [
            this.item({
              id: organization.id,
              type: "organization",
              title: organization.name,
              organizationId: organization.id,
              committeeId: null,
              committeeName: null,
              meetingId: null,
              meetingTitle: null,
              deletedAt: organization.deleted_at!,
              deletedBy: organization.deleted_by,
              deletedByName: this.profileName(profiles, organization.deleted_by),
              deleteExpiresAt: organization.delete_expires_at!,
              parentDeleted: false,
              now,
            }),
          ]
        : []),
      ...committees.map((committee) =>
        this.item({
          id: committee.id,
          type: "committee",
          title: committee.name,
          organizationId: committee.organization_id,
          committeeId: committee.id,
          committeeName: committee.name,
          meetingId: null,
          meetingTitle: null,
          deletedAt: committee.deleted_at!,
          deletedBy: committee.deleted_by,
          deletedByName: this.profileName(profiles, committee.deleted_by),
          deleteExpiresAt: committee.delete_expires_at!,
          parentDeleted: false,
          now,
        }),
      ),
      ...meetings.map((meeting) =>
        this.item({
          id: meeting.id,
          type: "meeting",
          title: meeting.title,
          organizationId: meeting.organization_id,
          committeeId: meeting.committee_id,
          committeeName: meeting.committee?.name ?? "Slettet udvalg",
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          deletedAt: meeting.deleted_at!,
          deletedBy: meeting.deleted_by,
          deletedByName: this.profileName(profiles, meeting.deleted_by),
          deleteExpiresAt: meeting.delete_expires_at!,
          parentDeleted: Boolean(meeting.committee?.deleted_at),
          now,
        }),
      ),
      ...agendaItems.map((agendaItem) => {
        const occurrence = agendaItem.agenda_item_occurrences
          .slice()
          .sort((left, right) =>
            (right.meetings?.starts_at ?? "").localeCompare(
              left.meetings?.starts_at ?? "",
            ),
          )[0];
        return this.item({
          id: agendaItem.id,
          type: "agenda_item",
          title: agendaItem.title,
          organizationId: agendaItem.organization_id,
          committeeId: agendaItem.committee_id,
          committeeName: agendaItem.committee?.name ?? "Slettet udvalg",
          meetingId: occurrence?.meetings?.id ?? null,
          meetingTitle: occurrence?.meetings?.title ?? null,
          deletedAt: agendaItem.deleted_at!,
          deletedBy: agendaItem.deleted_by,
          deletedByName: this.profileName(profiles, agendaItem.deleted_by),
          deleteExpiresAt: agendaItem.delete_expires_at!,
          parentDeleted: Boolean(agendaItem.committee?.deleted_at),
          now,
        });
      }),
    ].sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));

    return { items };
  }

  async restore(input: unknown) {
    const parsed = organizationTrashRestoreSchema.parse(input);
    if (parsed.type === "organization") {
      return new OrganizationService(this.db).restore({
        organizationId: parsed.organizationId,
      });
    }
    if (parsed.type === "committee") {
      return new CommitteeService(this.db).restore({
        organizationId: parsed.organizationId,
        committeeId: parsed.id,
      });
    }
    if (!parsed.committeeId) {
      throw new AppError("Udvalg mangler for gendannelse.", 422, "COMMITTEE_REQUIRED");
    }
    if (parsed.type === "meeting") {
      return new MeetingService(this.db).restore({
        organizationId: parsed.organizationId,
        committeeId: parsed.committeeId,
        meetingId: parsed.id,
      });
    }
    return new AgendaItemService(this.db).restore({
      organizationId: parsed.organizationId,
      committeeId: parsed.committeeId,
      agendaItemId: parsed.id,
    });
  }

  private item(input: {
    id: string;
    type: OrganizationTrashItem["type"];
    title: string;
    organizationId: string;
    committeeId: string | null;
    committeeName: string | null;
    meetingId: string | null;
    meetingTitle: string | null;
    deletedAt: string;
    deletedBy: string | null;
    deletedByName: string | null;
    deleteExpiresAt: string;
    parentDeleted: boolean;
    now: Date;
  }): OrganizationTrashItem {
    const daysLeft = Math.ceil(
      (new Date(input.deleteExpiresAt).getTime() - input.now.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    const expired = daysLeft <= 0;
    return {
      id: input.id,
      type: input.type,
      title: input.title,
      organizationId: input.organizationId,
      committeeId: input.committeeId,
      committeeName: input.committeeName,
      meetingId: input.meetingId,
      meetingTitle: input.meetingTitle,
      deletedAt: input.deletedAt,
      deletedBy: input.deletedBy,
      deletedByName: input.deletedByName,
      deleteExpiresAt: input.deleteExpiresAt,
      daysLeft: Math.max(0, daysLeft),
      status: expired ? "ready_for_permanent_delete" : "restorable",
      canRestore: !input.parentDeleted,
      restoreBlockedReason: input.parentDeleted
        ? "Gendan det slettede udvalg først."
        : null,
    };
  }

  private profileName(
    profiles: Map<string, { full_name: string | null }>,
    userId: string | null,
  ) {
    if (!userId) return null;
    return profiles.get(userId)?.full_name?.trim() || "Ukendt bruger";
  }
}
