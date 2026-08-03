"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Button,
  EmptyState,
  FieldError,
  Input,
  Modal,
  MutationFeedback,
  primarySurfaceLinkClassName,
  Select,
  StatusBadge,
  staticSurfaceClassName,
  Textarea,
} from "@/components/ui";
import {
  focusInvalidField,
  useMutationFeedback,
  useUnsavedChanges,
} from "@/hooks/use-mutation-feedback";
import { RelatedTasks } from "@/components/tasks/related-tasks";
import { TaskCreateModal } from "@/components/tasks/task-create-modal";
import { formatDanishDate } from "@/lib/date-format";
import {
  decisionRegisterSearchParams,
  emptyDecisionFilters,
  parseDecisionRegisterState,
} from "@/lib/decision-register-state";
import {
  decisionStatusLabels,
  decisionStatusOptions,
  decisionStatusTones,
  filterAndSortDecisions,
  getDecisionCategorySuggestions,
  getDecisionDeadlineState,
  normalizeDecisionCategory,
  type DecisionRegisterFilters,
  type DecisionSort,
  type DecisionStatus,
} from "@/lib/decisions";
import {
  firstFieldError,
  MutationRequestError,
  readMutationResponse,
} from "@/lib/mutation-feedback";
import type {
  DecisionRegisterData,
  DecisionView,
  OrganizationMemberDirectoryEntry,
  TaskRegisterData,
} from "@/types/domain";

type DecisionDraft = {
  id?: string;
  committeeId: string;
  meetingId: string;
  agendaItemId: string;
  title: string;
  description: string;
  status: DecisionStatus;
  responsibleUserId: string;
  decisionDate: string;
  deadline: string;
  category: string;
  internalNote: string;
};

const emptyDraft = (): DecisionDraft => ({
  committeeId: "",
  meetingId: "",
  agendaItemId: "",
  title: "",
  description: "",
  status: "not_started",
  responsibleUserId: "",
  decisionDate: new Date().toISOString().slice(0, 10),
  deadline: "",
  category: "",
  internalNote: "",
});

function memberName(member: OrganizationMemberDirectoryEntry) {
  return member.full_name?.trim() || member.email;
}

function formatDate(value: string | null) {
  if (!value) return "Ikke angivet";
  return formatDanishDate(value);
}

function draftFromDecision(decision: DecisionView): DecisionDraft {
  return {
    id: decision.id,
    committeeId: decision.committee_id,
    meetingId: decision.meeting ? (decision.meeting_id ?? "") : "",
    agendaItemId: decision.agendaItem ? (decision.agenda_item_id ?? "") : "",
    title: decision.title,
    description: decision.description,
    status: decision.status,
    responsibleUserId: decision.responsible_user_id ?? "",
    decisionDate: decision.decision_date,
    deadline: decision.deadline ?? "",
    category: decision.category ?? "",
    internalNote: decision.internal_note ?? "",
  };
}

export function DecisionRegister({
  organizationId,
  data,
  taskData,
}: {
  organizationId: string;
  data: DecisionRegisterData;
  taskData: TaskRegisterData;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [decisions, setDecisions] = useState(data.decisions);
  const [filters, setFilters] = useState<DecisionRegisterFilters>(() =>
    parseDecisionRegisterState(new URLSearchParams(searchParams.toString())),
  );
  const [draft, setDraft] = useState<DecisionDraft | null>(null);
  const [draftBaseline, setDraftBaseline] = useState<DecisionDraft | null>(
    null,
  );
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const mutation = useMutationFeedback();
  const dirty = Boolean(
    draft &&
    draftBaseline &&
    JSON.stringify(draft) !== JSON.stringify(draftBaseline),
  );
  const confirmDiscard = useUnsavedChanges(
    dirty && !mutation.pending,
    "Du har ændringer i beslutningen, som ikke er gemt. Vil du lukke uden at gemme?",
  );

  useEffect(() => {
    setDecisions(data.decisions);
  }, [data.decisions]);

  useEffect(() => {
    setFilters(
      parseDecisionRegisterState(new URLSearchParams(searchParams.toString())),
    );
  }, [searchParams]);

  const filteredDecisions = useMemo(() => {
    return filterAndSortDecisions(decisions, filters);
  }, [decisions, filters]);

  const categoryOptions = useMemo(() => {
    const categories = new Map<string, string>();
    for (const decision of decisions) {
      const value = decision.category?.trim();
      const normalized = normalizeDecisionCategory(value);
      if (value && normalized && !categories.has(normalized)) {
        categories.set(normalized, value);
      }
    }
    return [...categories.values()].sort((left, right) =>
      left.localeCompare(right, "da-DK"),
    );
  }, [decisions]);

  const meetingFilterOptions = useMemo(
    () =>
      data.meetings
        .filter((meeting) =>
          decisions.some((decision) => decision.meeting_id === meeting.id),
        )
        .sort((left, right) => right.starts_at.localeCompare(left.starts_at)),
    [data.meetings, decisions],
  );

  const responsibleFilterOptions = useMemo(() => {
    const memberById = new Map(
      data.members.map((member) => [member.user_id, member]),
    );
    const responsible = new Map<string, string>();
    for (const decision of decisions) {
      if (!decision.responsible_user_id) continue;
      const member = memberById.get(decision.responsible_user_id);
      responsible.set(
        decision.responsible_user_id,
        decision.responsible?.full_name ||
          (member ? memberName(member) : "Ukendt medlem"),
      );
    }
    return [...responsible.entries()].sort((left, right) =>
      left[1].localeCompare(right[1], "da-DK"),
    );
  }, [data.members, decisions]);

  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "" ||
    filters.committeeId !== "" ||
    filters.responsibleUserId !== "" ||
    filters.meetingId !== "" ||
    filters.category !== "" ||
    filters.decisionDateFrom !== "" ||
    filters.decisionDateTo !== "" ||
    filters.deadlineFrom !== "" ||
    filters.deadlineTo !== "" ||
    filters.showArchived;
  const hasModifiedFilterState =
    hasActiveFilters || filters.sort !== "decision_date_desc";
  const activeFilterLabels = [
    filters.search
      ? { key: "search" as const, label: `Søg: ${filters.search}` }
      : null,
    filters.status
      ? {
          key: "status" as const,
          label:
            decisionStatusLabels[filters.status as DecisionStatus] ??
            filters.status,
        }
      : null,
    filters.committeeId
      ? {
          key: "committeeId" as const,
          label:
            data.committees.find(
              (committee) => committee.id === filters.committeeId,
            )?.name ?? "Valgt udvalg",
        }
      : null,
    filters.responsibleUserId
      ? {
          key: "responsibleUserId" as const,
          label:
            responsibleFilterOptions.find(
              ([id]) => id === filters.responsibleUserId,
            )?.[1] ?? "Valgt ansvarlig",
        }
      : null,
    filters.meetingId
      ? {
          key: "meetingId" as const,
          label:
            data.meetings.find((meeting) => meeting.id === filters.meetingId)
              ?.title ?? "Valgt møde",
        }
      : null,
    filters.category
      ? { key: "category" as const, label: filters.category }
      : null,
    filters.decisionDateFrom
      ? {
          key: "decisionDateFrom" as const,
          label: `Fra ${formatDate(filters.decisionDateFrom)}`,
        }
      : null,
    filters.decisionDateTo
      ? {
          key: "decisionDateTo" as const,
          label: `Til ${formatDate(filters.decisionDateTo)}`,
        }
      : null,
    filters.deadlineFrom
      ? {
          key: "deadlineFrom" as const,
          label: `Deadline fra ${formatDate(filters.deadlineFrom)}`,
        }
      : null,
    filters.deadlineTo
      ? {
          key: "deadlineTo" as const,
          label: `Deadline til ${formatDate(filters.deadlineTo)}`,
        }
      : null,
    filters.showArchived
      ? { key: "showArchived" as const, label: "Arkiverede" }
      : null,
    filters.sort !== "decision_date_desc"
      ? { key: "sort" as const, label: "Ændret sortering" }
      : null,
  ].filter(
    (
      item,
    ): item is {
      key: keyof DecisionRegisterFilters;
      label: string;
    } => Boolean(item),
  );

  function updateFilter<K extends keyof DecisionRegisterFilters>(
    key: K,
    value: DecisionRegisterFilters[K],
  ) {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    replaceRegisterState(nextFilters);
  }

  function replaceRegisterState(nextFilters: DecisionRegisterFilters) {
    const next = decisionRegisterSearchParams(
      new URLSearchParams(searchParams.toString()),
      nextFilters,
    );
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function resetFilters() {
    const nextFilters = emptyDecisionFilters();
    setFilters(nextFilters);
    replaceRegisterState(nextFilters);
  }

  function clearFilter(key: keyof DecisionRegisterFilters) {
    const nextFilters = {
      ...filters,
      [key]:
        key === "showArchived"
          ? false
          : key === "sort"
            ? "decision_date_desc"
            : "",
    } as DecisionRegisterFilters;
    setFilters(nextFilters);
    replaceRegisterState(nextFilters);
  }

  const selectedCommitteeId = draft?.committeeId ?? "";
  const meetingOptions = data.meetings.filter(
    (meeting) => meeting.committee_id === selectedCommitteeId,
  );
  const agendaItemOptions = data.agendaItems.filter(
    (item) => item.committee_id === selectedCommitteeId,
  );
  const responsibleOptions = data.members.filter((member) =>
    member.committees.some((committee) => committee.id === selectedCommitteeId),
  );
  const categorySuggestions = useMemo(
    () =>
      getDecisionCategorySuggestions(
        decisions,
        selectedCommitteeId,
        draft?.category ?? "",
      ),
    [decisions, draft?.category, selectedCommitteeId],
  );

  function openCreate() {
    const next = emptyDraft();
    next.committeeId =
      data.agendaItems.find((item) =>
        data.editableCommitteeIds.includes(item.committee_id),
      )?.committee_id ?? "";
    setError(null);
    setFieldErrors({});
    mutation.reset();
    setDraft(next);
    setDraftBaseline(next);
  }

  function openEdit(decision: DecisionView) {
    const next = draftFromDecision(decision);
    setError(null);
    setFieldErrors({});
    mutation.reset();
    setDraft(next);
    setDraftBaseline(next);
  }

  function closeDraft() {
    if (mutation.pending || !confirmDiscard()) return;
    setDraft(null);
    setDraftBaseline(null);
  }

  function updateDraft<K extends keyof DecisionDraft>(
    key: K,
    value: DecisionDraft[K],
  ) {
    setDraft((current) => {
      if (!current) return current;
      if (key === "committeeId") {
        return {
          ...current,
          committeeId: String(value),
          meetingId: "",
          agendaItemId: "",
          responsibleUserId: "",
        };
      }
      return { ...current, [key]: value };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.id && !draft.agendaItemId) {
      const nextFieldErrors = {
        agendaItemId: "Vælg det dagsordenspunkt, beslutningen hører til.",
      };
      setFieldErrors(nextFieldErrors);
      mutation.fail(nextFieldErrors.agendaItemId);
      focusInvalidField("decision-agendaItemId");
      return;
    }
    if (!mutation.begin("Beslutningen gemmes...")) return;
    setError(null);
    setFieldErrors({});

    try {
      await readMutationResponse(
        await fetch(
          draft.id
            ? `/api/decisions/${draft.id}`
            : `/api/organizations/${organizationId}/decisions`,
          {
            method: draft.id ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              organizationId,
              committeeId: draft.committeeId,
              meetingId: draft.meetingId || null,
              agendaItemId: draft.agendaItemId || null,
              title: draft.title,
              description: draft.description,
              status: draft.status,
              responsibleUserId: draft.responsibleUserId || null,
              decisionDate: draft.decisionDate,
              deadline: draft.deadline || null,
              category: draft.category || null,
              internalNote: draft.internalNote || null,
            }),
          },
        ),
        "Beslutningen kunne ikke gemmes. Kontrollér felterne, og prøv igen.",
      );
      mutation.succeed(
        draft.id ? "Beslutningen er opdateret." : "Beslutningen er oprettet.",
      );
      setDraft(null);
      setDraftBaseline(null);
      router.refresh();
    } catch (caught) {
      const nextFieldErrors =
        caught instanceof MutationRequestError ? caught.fieldErrors : {};
      setFieldErrors(nextFieldErrors);
      mutation.fail(
        caught instanceof Error
          ? caught.message
          : "Forbindelsen til serveren mislykkedes. Kontrollér din internetforbindelse, og prøv igen.",
      );
      const field = firstFieldError(nextFieldErrors, [
        "agendaItemId",
        "title",
        "description",
        "committeeId",
        "status",
        "decisionDate",
        "deadline",
        "responsibleUserId",
        "category",
        "meetingId",
        "internalNote",
      ]);
      focusInvalidField(field ? `decision-${field}` : null);
    }
  }

  async function performAction(
    decision: DecisionView,
    action: "archive" | "cancel",
  ) {
    const question =
      action === "archive"
        ? `Vil du arkivere “${decision.title}”?`
        : `Vil du annullere “${decision.title}”?`;
    if (!window.confirm(question)) return;
    setActionId(decision.id);
    setError(null);
    try {
      const response = await fetch(`/api/decisions/${decision.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action }),
      });
      const result = (await response.json()) as {
        error?: string;
        status?: DecisionStatus;
        archived_at?: string | null;
        cancelled_at?: string | null;
        updated_at?: string;
      };
      if (!response.ok) {
        setError(result.error || "Handlingen kunne ikke gennemføres.");
        return;
      }
      setDecisions((current) =>
        current.map((item) =>
          item.id === decision.id ? { ...item, ...result } : item,
        ),
      );
      router.refresh();
    } catch {
      setError("Handlingen kunne ikke gennemføres. Prøv igen.");
    } finally {
      setActionId(null);
    }
  }

  const canCreate = data.agendaItems.some((item) =>
    data.editableCommitteeIds.includes(item.committee_id),
  );
  const isReadOnly = data.editableCommitteeIds.length === 0;

  return (
    <div className="space-y-6">
      <div className="module-filter-surface space-y-3">
        <div className="grid gap-2.5 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="decision-search">
              Søg
            </label>
            <Input
              id="decision-search"
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Søg i titel eller beskrivelse"
              value={filters.search}
            />
          </div>
          <div>
            <label className="label" htmlFor="decision-status-filter">
              Status
            </label>
            <Select
              id="decision-status-filter"
              onChange={(event) => updateFilter("status", event.target.value)}
              value={filters.status}
            >
              <option value="">Alle statusser</option>
              {decisionStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="decision-committee-filter">
              Udvalg
            </label>
            <Select
              id="decision-committee-filter"
              onChange={(event) =>
                updateFilter("committeeId", event.target.value)
              }
              value={filters.committeeId}
            >
              <option value="">Alle udvalg</option>
              {data.committees.map((committee) => (
                <option key={committee.id} value={committee.id}>
                  {committee.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <details className="group">
          <summary className="inline-flex min-h-10 w-fit cursor-pointer list-none items-center rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-sm font-semibold text-brand transition hover:border-brand/40 hover:bg-subtle">
            Avancerede filtre
          </summary>
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div>
              <label className="label" htmlFor="decision-responsible-filter">
                Ansvarlig
              </label>
              <Select
                id="decision-responsible-filter"
                onChange={(event) =>
                  updateFilter("responsibleUserId", event.target.value)
                }
                value={filters.responsibleUserId}
              >
                <option value="">Alle ansvarlige</option>
                {responsibleFilterOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="label" htmlFor="decision-sort">
                Sortering
              </label>
              <Select
                id="decision-sort"
                onChange={(event) =>
                  updateFilter("sort", event.target.value as DecisionSort)
                }
                value={filters.sort}
              >
                <option value="decision_date_desc">Nyeste først</option>
                <option value="decision_date_asc">Ældste først</option>
                <option value="deadline_asc">Deadline nærmest først</option>
                <option value="status">Status</option>
              </Select>
            </div>
            <div>
              <label className="label" htmlFor="decision-meeting-filter">
                Møde
              </label>
              <Select
                id="decision-meeting-filter"
                onChange={(event) =>
                  updateFilter("meetingId", event.target.value)
                }
                value={filters.meetingId}
              >
                <option value="">Alle møder</option>
                {meetingFilterOptions.map((meeting) => (
                  <option key={meeting.id} value={meeting.id}>
                    {meeting.title} · {formatDate(meeting.starts_at)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="label" htmlFor="decision-category-filter">
                Kategori
              </label>
              <Select
                id="decision-category-filter"
                onChange={(event) =>
                  updateFilter("category", event.target.value)
                }
                value={filters.category}
              >
                <option value="">Alle kategorier</option>
                {categoryOptions.map((category) => (
                  <option
                    key={normalizeDecisionCategory(category)}
                    value={category}
                  >
                    {category}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="label" htmlFor="decision-date-from">
                Beslutningsdato fra
              </label>
              <Input
                id="decision-date-from"
                onChange={(event) =>
                  updateFilter("decisionDateFrom", event.target.value)
                }
                type="date"
                value={filters.decisionDateFrom}
              />
            </div>
            <div>
              <label className="label" htmlFor="decision-date-to">
                Beslutningsdato til
              </label>
              <Input
                id="decision-date-to"
                onChange={(event) =>
                  updateFilter("decisionDateTo", event.target.value)
                }
                type="date"
                value={filters.decisionDateTo}
              />
            </div>
            <div>
              <label className="label" htmlFor="decision-deadline-from">
                Deadline fra
              </label>
              <Input
                id="decision-deadline-from"
                onChange={(event) =>
                  updateFilter("deadlineFrom", event.target.value)
                }
                type="date"
                value={filters.deadlineFrom}
              />
            </div>
            <div>
              <label className="label" htmlFor="decision-deadline-to">
                Deadline til
              </label>
              <Input
                id="decision-deadline-to"
                onChange={(event) =>
                  updateFilter("deadlineTo", event.target.value)
                }
                type="date"
                value={filters.deadlineTo}
              />
            </div>
          </div>
        </details>

        <div className="register-summary-bar">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                aria-live="polite"
                className="text-sm font-semibold text-ink"
              >
                {filteredDecisions.length} af {decisions.length} beslutninger
              </span>
              {isReadOnly ? (
                <StatusBadge tone="neutral">Skrivebeskyttet</StatusBadge>
              ) : null}
              {hasModifiedFilterState ? (
                <Button onClick={resetFilters} size="sm" variant="secondary">
                  Nulstil alle filtre
                </Button>
              ) : null}
            </div>
            {activeFilterLabels.length ? (
              <div aria-label="Aktive filtre" className="flex flex-wrap gap-2">
                {activeFilterLabels.map((filter) => (
                  <button
                    className="inline-flex min-h-9 items-center gap-1 rounded-full border border-brand/30 bg-brand/5 px-3 text-xs font-semibold text-brand transition hover:bg-brand/10"
                    key={filter.key}
                    onClick={() => clearFilter(filter.key)}
                    type="button"
                  >
                    {filter.label}
                    <span aria-hidden="true">×</span>
                    <span className="sr-only">Fjern filter</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="action-cluster">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                checked={filters.showArchived}
                onChange={(event) =>
                  updateFilter("showArchived", event.target.checked)
                }
                type="checkbox"
              />
              Vis arkiverede beslutninger
            </label>
            {canCreate ? (
              <Button onClick={openCreate}>Opret fra dagsordenspunkt</Button>
            ) : null}
          </div>
        </div>
      </div>

      {!draft ? <MutationFeedback feedback={mutation.feedback} /> : null}
      {error && !draft ? (
        <div
          className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {filteredDecisions.length > 0 ? (
        <div className="grid gap-2.5">
          {filteredDecisions.map((decision) => {
            const canEdit = data.editableCommitteeIds.includes(
              decision.committee_id,
            );
            const deadlineState = getDecisionDeadlineState(decision);
            const committeeRoot = `/organizations/${organizationId}/committees/${decision.committee_id}`;
            const relatedTasks = taskData.tasks.filter(
              (task) => task.decision_id === decision.id,
            );
            const responsiblePeople = taskData.members
              .filter(
                (member) =>
                  member.status === "active" &&
                  member.committees.some(
                    (committee) => committee.id === decision.committee_id,
                  ),
              )
              .map((member) => ({
                id: member.user_id,
                name: member.full_name || member.email,
              }));
            return (
              <article
                className={staticSurfaceClassName("entity-record")}
                id={`decision-${decision.id}`}
                key={decision.id}
              >
                <div className="entity-header">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="entity-title">{decision.title}</h2>
                      <StatusBadge tone={decisionStatusTones[decision.status]}>
                        {decisionStatusLabels[decision.status]}
                      </StatusBadge>
                      {decision.archived_at ? (
                        <StatusBadge>Arkiveret</StatusBadge>
                      ) : null}
                      {!canEdit && !isReadOnly ? (
                        <StatusBadge tone="neutral">
                          Skrivebeskyttet
                        </StatusBadge>
                      ) : null}
                      {decision.cancelled_at &&
                      decision.status !== "cancelled" ? (
                        <StatusBadge tone="danger">Annulleret</StatusBadge>
                      ) : null}
                    </div>
                    {decision.description ? (
                      <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-muted">
                        {decision.description}
                      </p>
                    ) : null}
                    <dl className="entity-metadata-grid">
                      <div>
                        <dt className="metadata">Udvalg</dt>
                        <dd>{decision.committee?.name ?? "Ukendt udvalg"}</dd>
                      </div>
                      <div>
                        <dt className="metadata">Ansvarlig</dt>
                        <dd>
                          {decision.responsible?.full_name || "Ikke angivet"}
                        </dd>
                      </div>
                      <div>
                        <dt className="metadata">Beslutningsdato</dt>
                        <dd>{formatDate(decision.decision_date)}</dd>
                      </div>
                      <div>
                        <dt className="metadata">Deadline</dt>
                        <dd className="flex flex-wrap items-center gap-2">
                          <span>
                            {decision.deadline
                              ? formatDate(decision.deadline)
                              : "Ingen deadline"}
                          </span>
                          {deadlineState === "overdue" ? (
                            <StatusBadge tone="danger">Overskredet</StatusBadge>
                          ) : null}
                          {deadlineState === "today" ? (
                            <StatusBadge tone="warning">I dag</StatusBadge>
                          ) : null}
                        </dd>
                      </div>
                      {decision.category ? (
                        <div>
                          <dt className="metadata">Kategori</dt>
                          <dd>
                            <span className="inline-flex rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-muted">
                              {decision.category}
                            </span>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm">
                      {decision.meeting ? (
                        <Link
                          className={primarySurfaceLinkClassName("text-sm")}
                          href={`${committeeRoot}/meetings/${decision.meeting.id}`}
                        >
                          Åbn møde: {decision.meeting.title}
                        </Link>
                      ) : decision.meeting_id ? (
                        <span className="font-medium text-muted">
                          Slettet møde
                        </span>
                      ) : null}
                      {decision.agendaItem ? (
                        <Link
                          className={primarySurfaceLinkClassName("text-sm")}
                          href={`${committeeRoot}/agenda-items/${decision.agendaItem.id}`}
                        >
                          Åbn dagsordenspunkt: {decision.agendaItem.title}
                        </Link>
                      ) : decision.agenda_item_id ? (
                        <span className="font-medium text-muted">
                          Slettet dagsordenspunkt
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {canEdit ? (
                    <div className="action-cluster w-full sm:w-auto sm:shrink-0 sm:justify-end">
                      <TaskCreateModal
                        agendaItems={taskData.agendaItems.filter(
                          (item) => item.committee_id === decision.committee_id,
                        )}
                        categorySource={taskData.tasks}
                        committeeId={decision.committee_id}
                        decisions={[decision]}
                        initialAgendaItemId={
                          decision.agendaItem
                            ? (decision.agenda_item_id ?? "")
                            : ""
                        }
                        initialCategory={decision.category ?? ""}
                        initialDeadline={decision.deadline ?? ""}
                        initialDecisionId={decision.id}
                        initialDescription={decision.description}
                        initialMeetingId={
                          decision.meeting ? (decision.meeting_id ?? "") : ""
                        }
                        initialResponsibleUserId={
                          decision.responsible_user_id ?? ""
                        }
                        initialTitle={decision.title}
                        instanceId={`decision-task-${decision.id}`}
                        meetings={taskData.meetings.filter(
                          (meeting) =>
                            meeting.committee_id === decision.committee_id,
                        )}
                        organizationId={organizationId}
                        responsiblePeople={responsiblePeople}
                        sourceLabel="beslutningen"
                        triggerLabel="Opret opgave fra beslutning"
                      />
                      <Button
                        onClick={() => openEdit(decision)}
                        size="sm"
                        variant="secondary"
                      >
                        Rediger
                      </Button>
                      {!decision.archived_at ? (
                        <Button
                          disabled={actionId === decision.id}
                          onClick={() => performAction(decision, "archive")}
                          size="sm"
                          variant="secondary"
                        >
                          Arkiver
                        </Button>
                      ) : null}
                      {decision.status !== "cancelled" ? (
                        <Button
                          disabled={actionId === decision.id}
                          onClick={() => performAction(decision, "cancel")}
                          size="sm"
                          variant="danger"
                        >
                          Annuller
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {relatedTasks.length ? (
                  <div className="mt-3 rounded-[var(--radius-control)] border border-line bg-subtle/35 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      Relaterede opgaver
                    </p>
                    <RelatedTasks
                      compact
                      organizationId={organizationId}
                      tasks={relatedTasks}
                    />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          action={
            hasActiveFilters ? (
              <Button onClick={resetFilters} variant="secondary">
                Nulstil filtre
              </Button>
            ) : canCreate ? (
              <Button onClick={openCreate}>Opret fra dagsordenspunkt</Button>
            ) : null
          }
          description={
            decisions.length && hasActiveFilters
              ? "Ingen beslutninger matcher de valgte filtre. Ryd et eller flere filtre for at udvide visningen."
              : decisions.length
                ? "Der er ingen aktive beslutninger at vise. Arkiverede beslutninger kan vises via filteret."
                : canCreate
                  ? "Opret den første beslutning fra det dagsordenspunkt, hvor den blev truffet."
                  : "Der er endnu ikke registreret beslutninger i de udvalg, du har adgang til."
          }
          title={
            hasActiveFilters
              ? "Ingen beslutninger matcher filtrene."
              : "Der er ingen beslutninger at vise."
          }
        />
      )}

      <Modal
        description={
          draft?.id
            ? "Bevar beslutningens autoritative dagsordenskontekst, når relationer ændres."
            : "Vælg først det dagsordenspunkt, hvor beslutningen blev truffet. Beslutningen kan ikke oprettes uden denne relation."
        }
        maxWidth="3xl"
        onClose={closeDraft}
        open={Boolean(draft)}
        title={draft?.id ? "Rediger beslutning" : "Opret beslutning"}
      >
        {draft ? (
          <form className="space-y-4" noValidate onSubmit={submit}>
            <MutationFeedback feedback={mutation.feedback} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="decision-title">
                  Titel
                </label>
                <Input
                  aria-describedby={
                    fieldErrors.title ? "decision-title-error" : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.title)}
                  id="decision-title"
                  onChange={(event) => updateDraft("title", event.target.value)}
                  value={draft.title}
                />
                <FieldError
                  id="decision-title-error"
                  message={fieldErrors.title}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="decision-description">
                  Beskrivelse
                </label>
                <Textarea
                  aria-describedby={
                    fieldErrors.description
                      ? "decision-description-error"
                      : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.description)}
                  id="decision-description"
                  onChange={(event) =>
                    updateDraft("description", event.target.value)
                  }
                  value={draft.description}
                />
                <FieldError
                  id="decision-description-error"
                  message={fieldErrors.description}
                />
              </div>
              <div>
                <label className="label" htmlFor="decision-committeeId">
                  Udvalg
                </label>
                <Select
                  aria-describedby={
                    fieldErrors.committeeId
                      ? "decision-committeeId-error"
                      : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.committeeId)}
                  id="decision-committeeId"
                  onChange={(event) =>
                    updateDraft("committeeId", event.target.value)
                  }
                  value={draft.committeeId}
                >
                  <option value="">Vælg udvalg</option>
                  {data.committees
                    .filter((committee) =>
                      data.editableCommitteeIds.includes(committee.id),
                    )
                    .map((committee) => (
                      <option key={committee.id} value={committee.id}>
                        {committee.name}
                      </option>
                    ))}
                </Select>
                <FieldError
                  id="decision-committeeId-error"
                  message={fieldErrors.committeeId}
                />
              </div>
              <div>
                <label className="label" htmlFor="decision-status">
                  Status
                </label>
                <Select
                  aria-describedby={
                    fieldErrors.status ? "decision-status-error" : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.status)}
                  id="decision-status"
                  onChange={(event) =>
                    updateDraft("status", event.target.value as DecisionStatus)
                  }
                  value={draft.status}
                >
                  {decisionStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <FieldError
                  id="decision-status-error"
                  message={fieldErrors.status}
                />
              </div>
              <div>
                <label className="label" htmlFor="decision-decisionDate">
                  Beslutningsdato
                </label>
                <Input
                  aria-describedby={
                    fieldErrors.decisionDate
                      ? "decision-decisionDate-error"
                      : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.decisionDate)}
                  id="decision-decisionDate"
                  onChange={(event) =>
                    updateDraft("decisionDate", event.target.value)
                  }
                  type="date"
                  value={draft.decisionDate}
                />
                <FieldError
                  id="decision-decisionDate-error"
                  message={fieldErrors.decisionDate}
                />
              </div>
              <div>
                <label className="label" htmlFor="decision-deadline">
                  Deadline
                </label>
                <Input
                  aria-describedby={
                    fieldErrors.deadline ? "decision-deadline-error" : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.deadline)}
                  id="decision-deadline"
                  onChange={(event) =>
                    updateDraft("deadline", event.target.value)
                  }
                  type="date"
                  value={draft.deadline}
                />
                <FieldError
                  id="decision-deadline-error"
                  message={fieldErrors.deadline}
                />
              </div>
              <div>
                <label className="label" htmlFor="decision-responsibleUserId">
                  Ansvarlig
                </label>
                <Select
                  aria-describedby={
                    fieldErrors.responsibleUserId
                      ? "decision-responsibleUserId-error"
                      : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.responsibleUserId)}
                  id="decision-responsibleUserId"
                  onChange={(event) =>
                    updateDraft("responsibleUserId", event.target.value)
                  }
                  value={draft.responsibleUserId}
                >
                  <option value="">Ingen ansvarlig</option>
                  {responsibleOptions.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {memberName(member)}
                    </option>
                  ))}
                </Select>
                <FieldError
                  id="decision-responsibleUserId-error"
                  message={fieldErrors.responsibleUserId}
                />
              </div>
              <div>
                <label className="label" htmlFor="decision-category">
                  Kategori
                </label>
                <Input
                  aria-describedby={
                    fieldErrors.category ? "decision-category-error" : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.category)}
                  autoComplete="off"
                  id="decision-category"
                  list="decision-category-suggestions"
                  onChange={(event) =>
                    updateDraft("category", event.target.value)
                  }
                  placeholder="Skriv eller vælg en tidligere kategori"
                  value={draft.category}
                />
                <FieldError
                  id="decision-category-error"
                  message={fieldErrors.category}
                />
                <datalist id="decision-category-suggestions">
                  {categorySuggestions.map((category) => (
                    <option
                      key={category.toLocaleLowerCase("da-DK")}
                      value={category}
                    />
                  ))}
                </datalist>
                <p className="mt-1 text-xs text-muted">
                  Forslag kommer fra tidligere beslutninger i det valgte udvalg.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="decision-meetingId">
                  Relateret møde
                </label>
                <Select
                  aria-describedby={
                    fieldErrors.meetingId
                      ? "decision-meetingId-error"
                      : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.meetingId)}
                  id="decision-meetingId"
                  onChange={(event) =>
                    updateDraft("meetingId", event.target.value)
                  }
                  value={draft.meetingId}
                >
                  <option value="">Intet møde</option>
                  {meetingOptions.map((meeting) => (
                    <option key={meeting.id} value={meeting.id}>
                      {meeting.title} · {formatDate(meeting.starts_at)}
                    </option>
                  ))}
                </Select>
                <FieldError
                  id="decision-meetingId-error"
                  message={fieldErrors.meetingId}
                />
              </div>
              <div>
                <label className="label" htmlFor="decision-agendaItemId">
                  Dagsordenspunkt <span aria-hidden="true">*</span>
                </label>
                <Select
                  aria-describedby="decision-agenda-context decision-agendaItemId-error"
                  aria-invalid={Boolean(fieldErrors.agendaItemId)}
                  id="decision-agendaItemId"
                  onChange={(event) =>
                    updateDraft("agendaItemId", event.target.value)
                  }
                  value={draft.agendaItemId}
                >
                  <option value="">Vælg dagsordenspunkt</option>
                  {agendaItemOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </Select>
                <p
                  className="mt-1 text-xs text-muted"
                  id="decision-agenda-context"
                >
                  Beslutningen gemmes som en del af dette punkts historik.
                </p>
                <FieldError
                  id="decision-agendaItemId-error"
                  message={fieldErrors.agendaItemId}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="decision-internalNote">
                  Intern note
                </label>
                <Textarea
                  aria-describedby={
                    fieldErrors.internalNote
                      ? "decision-internalNote-error"
                      : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.internalNote)}
                  id="decision-internalNote"
                  onChange={(event) =>
                    updateDraft("internalNote", event.target.value)
                  }
                  value={draft.internalNote}
                />
                <FieldError
                  id="decision-internalNote-error"
                  message={fieldErrors.internalNote}
                />
              </div>
            </div>
            <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface/95 px-1 py-3 backdrop-blur">
              <p className="text-xs text-muted" role="status">
                {dirty
                  ? "Der er ændringer, som ikke er gemt."
                  : "Ingen ugemte ændringer."}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  disabled={mutation.pending}
                  onClick={closeDraft}
                  type="button"
                  variant="secondary"
                >
                  Annuller
                </Button>
                <Button disabled={mutation.pending} type="submit">
                  {mutation.pending ? "Gemmer..." : "Gem beslutning"}
                </Button>
              </div>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
