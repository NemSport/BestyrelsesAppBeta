import type { SupabaseClient } from "@supabase/supabase-js";

import { formatDanishDate } from "@/lib/date-format";
import {
  globalSearchCategories,
  deduplicateGlobalSearchResults,
  globalSearchHref,
  globalSearchLabels,
  normalizeGlobalSearchQuery,
  rankGlobalSearchResults,
  toPostgrestSearchTerm,
  type GlobalSearchCategory,
  type GlobalSearchGroup,
  type GlobalSearchResult,
} from "@/lib/global-search";
import { richTextToPlainText } from "@/lib/rich-text";
import { taskStatusLabels } from "@/lib/tasks";
import { stakeholderStatusLabels, stakeholderTypeLabels } from "@/lib/stakeholders";
import { GlobalSearchRepository } from "@/repositories/global-search-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

type Relation = {
  id: string;
  name?: string;
  full_name?: string;
  title?: string;
  starts_at?: string;
} | null;

function relation(value: unknown): Relation {
  if (!value) return null;
  return (Array.isArray(value) ? value[0] : value) as Relation;
}

function plain(value: string | null | undefined) {
  return richTextToPlainText(value).replace(/\s+/g, " ").trim();
}

function descriptionFor(query: string, ...values: Array<string | null | undefined>) {
  const text = values.map(plain).filter(Boolean).join(" · ");
  if (!text) return null;
  const needle = normalizeGlobalSearchQuery(query).toLocaleLowerCase("da-DK");
  const match = text.toLocaleLowerCase("da-DK").indexOf(needle);
  const start = match > 55 ? Math.max(0, match - 35) : 0;
  const clipped = text.slice(start, start + 180).trim();
  return `${start ? "…" : ""}${clipped}${start + 180 < text.length ? "…" : ""}`;
}

export class GlobalSearchService {
  private readonly repository: GlobalSearchRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.repository = new GlobalSearchRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async search(input: {
    organizationId: string;
    query: string;
    category?: string | null;
  }) {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationMember(input.organizationId, user.id);

    const query = normalizeGlobalSearchQuery(input.query);
    const category = globalSearchCategories.includes(input.category as GlobalSearchCategory)
      ? (input.category as GlobalSearchCategory)
      : "all";
    if (query.length < 2 || !toPostgrestSearchTerm(query)) {
      return { query, groups: [] };
    }

    const enabled = (value: GlobalSearchCategory) => category === "all" || category === value;
    const committees = await this.repository.committees(input.organizationId);
    const matchingCommitteeIds = committees
      .filter((committee) => committee.name.toLocaleLowerCase("da-DK").includes(query.toLocaleLowerCase("da-DK")))
      .map((committee) => committee.id);

    const [
      meetingRows,
      committeeMeetingRows,
      agendaRows,
      meetingMinutesRows,
      agendaMinutesRows,
      decisionRows,
      taskRows,
      documentRows,
      stakeholderRows,
      stakeholderContactRows,
      stakeholderContractRows,
      annualWheelRows,
    ] = await Promise.all([
      enabled("meetings") ? this.repository.meetings(input.organizationId, query) : [],
      enabled("meetings") ? this.repository.meetingsInCommittees(input.organizationId, matchingCommitteeIds) : [],
      enabled("agenda_items") ? this.repository.agendaItems(input.organizationId, query) : [],
      enabled("minutes") ? this.repository.meetingMinutes(input.organizationId, query) : [],
      enabled("minutes") ? this.repository.agendaItemMinutes(input.organizationId, query) : [],
      enabled("decisions") ? this.repository.decisions(input.organizationId, query) : [],
      enabled("tasks") ? this.repository.tasks(input.organizationId, query) : [],
      enabled("documents") ? this.repository.documents(input.organizationId, query) : [],
      enabled("stakeholders") ? this.repository.stakeholders(input.organizationId, query) : [],
      enabled("stakeholders") ? this.repository.stakeholderContacts(input.organizationId, query) : [],
      enabled("stakeholders") ? this.repository.stakeholderContracts(input.organizationId, query) : [],
      enabled("annual_wheel") ? this.repository.annualWheel(input.organizationId, query) : [],
    ]);

    const [approvedMeetingIds, agendaOccurrences] = await Promise.all([
      enabled("minutes")
        ? this.repository.approvedMeetingIds(agendaMinutesRows.map((row) => row.meeting_id))
        : new Set<string>(),
      enabled("agenda_items")
        ? this.repository.agendaItemOccurrences(agendaRows.map((row) => row.id))
        : [],
    ]);
    const latestAgendaOccurrence = new Map<string, Relation>();
    for (const occurrence of agendaOccurrences) {
      const meeting = relation(occurrence.meeting);
      const existing = latestAgendaOccurrence.get(occurrence.agenda_item_id);
      if (
        meeting?.starts_at &&
        (!existing?.starts_at || meeting.starts_at > existing.starts_at)
      ) {
        latestAgendaOccurrence.set(occurrence.agenda_item_id, meeting);
      }
    }

    const meetingResults = deduplicateGlobalSearchResults([...meetingRows, ...committeeMeetingRows].map((row) => {
      const committee = relation(row.committee);
      return {
        id: row.id,
        type: "meetings" as const,
        title: row.title,
        description: descriptionFor(query, row.description),
        context: committee?.name ?? "Møde",
        date: formatDanishDate(row.starts_at, "medium"),
        href: globalSearchHref({ type: "meeting", organizationId: input.organizationId, committeeId: row.committee_id, meetingId: row.id }),
        updatedAt: row.updated_at,
      };
    }));

    const agendaResults = agendaRows.map((row) => {
      const committee = relation(row.committee);
      const meeting = latestAgendaOccurrence.get(row.id);
      return {
        id: row.id,
        type: "agenda_items" as const,
        title: row.title,
        description: descriptionFor(query, row.objective, row.description),
        context: [committee?.name, meeting?.title].filter(Boolean).join(" · ") || "Dagsordenspunkt",
        date: meeting?.starts_at ? formatDanishDate(meeting.starts_at, "medium") : null,
        href: globalSearchHref({ type: "agenda_item", organizationId: input.organizationId, committeeId: row.committee_id, agendaItemId: row.id }),
        updatedAt: row.updated_at,
      };
    });

    const minutesResults: GlobalSearchResult[] = [
      ...meetingMinutesRows.map((row) => {
        const meeting = relation(row.meeting);
        const committee = relation(row.committee);
        return {
          id: row.id,
          type: "minutes" as const,
          title: `Referat · ${meeting?.title ?? "Møde"}`,
          description: descriptionFor(query, row.minutes_text, row.decisions),
          context: committee?.name ?? "Godkendt referat",
          date: meeting?.starts_at ? formatDanishDate(meeting.starts_at, "medium") : null,
          href: globalSearchHref({ type: "meeting_minutes", organizationId: input.organizationId, committeeId: row.committee_id, meetingId: row.meeting_id }),
          updatedAt: row.updated_at,
        };
      }),
      ...agendaMinutesRows.filter((row) => approvedMeetingIds.has(row.meeting_id)).map((row) => {
        const meeting = relation(row.meeting);
        const agendaItem = relation(row.agendaItem);
        const committee = relation(row.committee);
        return {
          id: row.id,
          type: "minutes" as const,
          title: agendaItem?.title ?? "Punktreferat",
          description: descriptionFor(query, row.notes, row.decision, row.follow_up),
          context: `${committee?.name ?? "Udvalg"} · Godkendt referat`,
          date: meeting?.starts_at ? formatDanishDate(meeting.starts_at, "medium") : null,
          href: globalSearchHref({ type: "agenda_item_minutes", organizationId: input.organizationId, committeeId: row.committee_id, meetingId: row.meeting_id, occurrenceId: row.agenda_item_occurrence_id }),
          updatedAt: row.updated_at,
        };
      }),
    ];

    const decisionResults = decisionRows.map((row) => {
      const agendaItem = relation(row.agendaItem);
      const meeting = relation(row.meeting);
      return {
        id: row.id,
        type: "decisions" as const,
        title: row.title,
        description: descriptionFor(query, row.description),
        context: [relation(row.committee)?.name, agendaItem?.title ?? meeting?.title]
          .filter(Boolean)
          .join(" · ") || "Beslutning",
        date: formatDanishDate(row.decision_date, "medium"),
        href: globalSearchHref({
          type: "decision",
          organizationId: input.organizationId,
          decisionId: row.id,
          committeeId: row.committee_id,
          agendaItemId: row.agenda_item_id,
          meetingId: row.meeting_id,
        }),
        updatedAt: row.updated_at,
      };
    });

    const taskResults = taskRows.map((row) => {
      const responsible = relation(row.responsible);
      return {
        id: row.id,
        type: "tasks" as const,
        title: row.title,
        description: descriptionFor(query, row.description),
        context: [
          relation(row.committee)?.name,
          responsible?.full_name,
          taskStatusLabels[row.status],
        ].filter(Boolean).join(" · ") || "Opgave",
        date: row.deadline ? `Frist ${formatDanishDate(row.deadline, "medium")}` : null,
        href: globalSearchHref({ type: "task", organizationId: input.organizationId, taskId: row.id }),
        updatedAt: row.updated_at,
      };
    });

    const documentResults = documentRows.map((row) => ({
      id: row.id,
      type: "documents" as const,
      title: row.name,
      description: descriptionFor(query, row.description),
      context: [relation(row.primaryCommittee)?.name, relation(row.category)?.name]
        .filter(Boolean)
        .join(" · ") || "Dokument",
      date: formatDanishDate(row.updated_at, "medium"),
      href: globalSearchHref({ type: "document", organizationId: input.organizationId, documentId: row.id }),
      updatedAt: row.updated_at,
    }));

    const stakeholderResults: GlobalSearchResult[] = deduplicateGlobalSearchResults([
      ...stakeholderRows.map((row) => ({
        id: row.id,
        type: "stakeholders" as const,
        title: row.name,
        description: descriptionFor(query, row.notes, row.cvr_number, row.email),
        context: `${stakeholderTypeLabels[row.stakeholder_type]} · ${stakeholderStatusLabels[row.relationship_status]}`,
        date: null,
        href: globalSearchHref({ type: "stakeholder", organizationId: input.organizationId, stakeholderId: row.id }),
        updatedAt: row.updated_at,
      })),
      ...stakeholderContactRows.flatMap((row) => {
        const stakeholder = relation(row.stakeholder) as (Relation & { stakeholder_type?: keyof typeof stakeholderTypeLabels; relationship_status?: keyof typeof stakeholderStatusLabels; updated_at?: string; archived_at?: string | null }) | null;
        return stakeholder?.id && !stakeholder.archived_at ? [{ id: stakeholder.id, type: "stakeholders" as const, title: stakeholder.name ?? "Interessent",
          description: `Kontaktperson: ${row.name}${row.email ? ` · ${row.email}` : ""}`,
          context: stakeholder.stakeholder_type && stakeholder.relationship_status ? `${stakeholderTypeLabels[stakeholder.stakeholder_type]} · ${stakeholderStatusLabels[stakeholder.relationship_status]}` : "Interessent",
          date: null, href: globalSearchHref({ type: "stakeholder", organizationId: input.organizationId, stakeholderId: stakeholder.id }), updatedAt: stakeholder.updated_at ?? row.updated_at }] : [];
      }),
      ...stakeholderContractRows.flatMap((row) => {
        const stakeholder = relation(row.stakeholder) as (Relation & { stakeholder_type?: keyof typeof stakeholderTypeLabels; relationship_status?: keyof typeof stakeholderStatusLabels; updated_at?: string; archived_at?: string | null }) | null;
        return stakeholder?.id && !stakeholder.archived_at ? [{ id: stakeholder.id, type: "stakeholders" as const, title: stakeholder.name ?? "Interessent",
          description: `Kontrakt: ${row.title}${row.annual_value !== null ? ` · ${Number(row.annual_value).toLocaleString("da-DK")} ${row.currency}/år` : ""}`,
          context: stakeholder.stakeholder_type && stakeholder.relationship_status ? `${stakeholderTypeLabels[stakeholder.stakeholder_type]} · ${stakeholderStatusLabels[stakeholder.relationship_status]}` : "Interessent",
          date: null, href: globalSearchHref({ type: "stakeholder", organizationId: input.organizationId, stakeholderId: stakeholder.id }), updatedAt: stakeholder.updated_at ?? row.updated_at }] : [];
      }),
    ]);

    const annualWheelResults = annualWheelRows.map((row) => ({
      id: row.id,
      type: "annual_wheel" as const,
      title: row.title,
      description: descriptionFor(query, row.description),
      context: relation(row.committee)?.name ?? "Organisationens årshjul",
      date: formatDanishDate(row.starts_on, "medium"),
      href: globalSearchHref({ type: "annual_wheel", organizationId: input.organizationId, startsOn: row.starts_on }),
      updatedAt: row.updated_at,
    }));

    const resultSets: Array<[GlobalSearchResult["type"], GlobalSearchResult[]]> = [
      ["meetings", meetingResults],
      ["agenda_items", agendaResults],
      ["minutes", minutesResults],
      ["decisions", decisionResults],
      ["tasks", taskResults],
      ["documents", documentResults],
      ["stakeholders", stakeholderResults],
      ["annual_wheel", annualWheelResults],
    ];
    const groups: GlobalSearchGroup[] = resultSets.flatMap(([type, results]) => {
      const ranked = rankGlobalSearchResults(deduplicateGlobalSearchResults(results), query);
      return ranked.length ? [{ type, label: globalSearchLabels[type], results: ranked }] : [];
    });
    return { query, groups };
  }
}
