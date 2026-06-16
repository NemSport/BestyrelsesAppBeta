"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  EmptyState,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { RelatedTasks } from "@/components/tasks/related-tasks";
import { TaskCreateModal } from "@/components/tasks/task-create-modal";
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
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

const emptyFilters = (): DecisionRegisterFilters => ({
  search: "",
  status: "",
  committeeId: "",
  responsibleUserId: "",
  meetingId: "",
  category: "",
  decisionDateFrom: "",
  decisionDateTo: "",
  deadlineFrom: "",
  deadlineTo: "",
  showArchived: false,
  sort: "decision_date_desc",
});

function draftFromDecision(decision: DecisionView): DecisionDraft {
  return {
    id: decision.id,
    committeeId: decision.committee_id,
    meetingId: decision.meeting_id ?? "",
    agendaItemId: decision.agenda_item_id ?? "",
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
  const router = useRouter();
  const [decisions, setDecisions] = useState(data.decisions);
  const [filters, setFilters] = useState<DecisionRegisterFilters>(emptyFilters);
  const [draft, setDraft] = useState<DecisionDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setDecisions(data.decisions);
  }, [data.decisions]);

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

  function updateFilter<K extends keyof DecisionRegisterFilters>(
    key: K,
    value: DecisionRegisterFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
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
    next.committeeId = data.editableCommitteeIds[0] ?? "";
    setError(null);
    setFieldErrors({});
    setDraft(next);
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
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await fetch(
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
      );
      const result = (await response.json()) as {
        error?: string;
        fieldErrors?: Record<string, string[]>;
      };
      if (!response.ok) {
        setError(result.error || "Beslutningen kunne ikke gemmes.");
        setFieldErrors(
          Object.fromEntries(
            Object.entries(result.fieldErrors ?? {}).flatMap(([key, messages]) =>
              messages[0] ? [[key, messages[0]]] : [],
            ),
          ),
        );
        return;
      }
      setDraft(null);
      router.refresh();
    } catch {
      setError(
        "Forbindelsen til serveren mislykkedes. Kontrollér din internetforbindelse, og prøv igen.",
      );
    } finally {
      setSaving(false);
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

  const canCreate = data.editableCommitteeIds.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-4 border-y border-line py-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
        </div>

        <details className="group">
          <summary className="w-fit cursor-pointer text-sm font-semibold text-brand">
            Flere filtre
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
                    {meeting.title} · {formatDate(meeting.starts_at.slice(0, 10))}
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
                  <option key={normalizeDecisionCategory(category)} value={category}>
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
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
            <span className="text-sm text-muted">
              {filteredDecisions.length} af {decisions.length} beslutninger
            </span>
            {hasActiveFilters ? (
              <Button
                onClick={() => setFilters(emptyFilters())}
                size="sm"
                variant="secondary"
              >
                Ryd filtre
              </Button>
            ) : null}
          </div>
          <Button disabled={!canCreate} onClick={openCreate}>
            Opret beslutning
          </Button>
        </div>
      </div>

      {error && !draft ? (
        <div className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {filteredDecisions.length > 0 ? (
        <div className="divide-y divide-line border-y border-line">
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
                className="scroll-mt-24 py-5"
                id={`decision-${decision.id}`}
                key={decision.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{decision.title}</h2>
                      <StatusBadge tone={decisionStatusTones[decision.status]}>
                        {decisionStatusLabels[decision.status]}
                      </StatusBadge>
                      {decision.archived_at ? (
                        <StatusBadge>Arkiveret</StatusBadge>
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
                    <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
                    <div className="mt-3 flex flex-wrap gap-4 text-sm">
                      {decision.meeting ? (
                        <Link
                          className="font-semibold text-brand hover:underline"
                          href={`${committeeRoot}/meetings/${decision.meeting.id}`}
                        >
                          Åbn møde: {decision.meeting.title}
                        </Link>
                      ) : null}
                      {decision.agendaItem ? (
                        <Link
                          className="font-semibold text-brand hover:underline"
                          href={`${committeeRoot}/agenda-items/${decision.agendaItem.id}`}
                        >
                          Åbn dagsordenspunkt: {decision.agendaItem.title}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      <TaskCreateModal
                        agendaItems={taskData.agendaItems.filter(
                          (item) => item.committee_id === decision.committee_id,
                        )}
                        categorySource={taskData.tasks}
                        committeeId={decision.committee_id}
                        decisions={[decision]}
                        initialAgendaItemId={decision.agenda_item_id ?? ""}
                        initialCategory={decision.category ?? ""}
                        initialDeadline={decision.deadline ?? ""}
                        initialDecisionId={decision.id}
                        initialDescription={decision.description}
                        initialMeetingId={decision.meeting_id ?? ""}
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
                        onClick={() => {
                          setError(null);
                          setFieldErrors({});
                          setDraft(draftFromDecision(decision));
                        }}
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
                  <div className="mt-4 border-t border-line pt-3">
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
          description={
            decisions.length && hasActiveFilters
              ? "Ingen beslutninger matcher de valgte filtre. Ryd et eller flere filtre for at udvide visningen."
              : decisions.length
                ? "Der er ingen aktive beslutninger at vise. Arkiverede beslutninger kan vises via filteret."
                : canCreate
                  ? "Opret den første beslutning, når et udvalg har truffet den."
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
        description="Beslutningen knyttes til et udvalg og kan valgfrit forbindes til et møde og dagsordenspunkt."
        maxWidth="3xl"
        onClose={() => setDraft(null)}
        open={Boolean(draft)}
        title={draft?.id ? "Rediger beslutning" : "Opret beslutning"}
      >
        {draft ? (
          <form className="space-y-5" noValidate onSubmit={submit}>
            {error ? (
              <div className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm">
                <p className="font-semibold">{error}</p>
                {Object.values(fieldErrors).length ? (
                  <ul className="mt-2 list-disc pl-5">
                    {[...new Set(Object.values(fieldErrors))].map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="decision-title">
                  Titel
                </label>
                <Input
                  id="decision-title"
                  onChange={(event) => updateDraft("title", event.target.value)}
                  value={draft.title}
                />
                {fieldErrors.title ? (
                  <p className="mt-1 text-sm text-danger">{fieldErrors.title}</p>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="decision-description">
                  Beskrivelse
                </label>
                <Textarea
                  id="decision-description"
                  onChange={(event) =>
                    updateDraft("description", event.target.value)
                  }
                  value={draft.description}
                />
              </div>
              <div>
                <label className="label" htmlFor="decision-committee">
                  Udvalg
                </label>
                <Select
                  id="decision-committee"
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
              </div>
              <div>
                <label className="label" htmlFor="decision-status">
                  Status
                </label>
                <Select
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
              </div>
              <div>
                <label className="label" htmlFor="decision-date">
                  Beslutningsdato
                </label>
                <Input
                  id="decision-date"
                  onChange={(event) =>
                    updateDraft("decisionDate", event.target.value)
                  }
                  type="date"
                  value={draft.decisionDate}
                />
              </div>
              <div>
                <label className="label" htmlFor="decision-deadline">
                  Deadline
                </label>
                <Input
                  id="decision-deadline"
                  onChange={(event) =>
                    updateDraft("deadline", event.target.value)
                  }
                  type="date"
                  value={draft.deadline}
                />
              </div>
              <div>
                <label className="label" htmlFor="decision-responsible">
                  Ansvarlig
                </label>
                <Select
                  id="decision-responsible"
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
              </div>
              <div>
                <label className="label" htmlFor="decision-category">
                  Kategori
                </label>
                <Input
                  autoComplete="off"
                  id="decision-category"
                  list="decision-category-suggestions"
                  onChange={(event) =>
                    updateDraft("category", event.target.value)
                  }
                  placeholder="Skriv eller vælg en tidligere kategori"
                  value={draft.category}
                />
                <datalist id="decision-category-suggestions">
                  {categorySuggestions.map((category) => (
                    <option key={category.toLocaleLowerCase("da-DK")} value={category} />
                  ))}
                </datalist>
                <p className="mt-1 text-xs text-muted">
                  Forslag kommer fra tidligere beslutninger i det valgte udvalg.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="decision-meeting">
                  Relateret møde
                </label>
                <Select
                  id="decision-meeting"
                  onChange={(event) =>
                    updateDraft("meetingId", event.target.value)
                  }
                  value={draft.meetingId}
                >
                  <option value="">Intet møde</option>
                  {meetingOptions.map((meeting) => (
                    <option key={meeting.id} value={meeting.id}>
                      {meeting.title} · {formatDate(meeting.starts_at.slice(0, 10))}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="label" htmlFor="decision-agenda-item">
                  Relateret dagsordenspunkt
                </label>
                <Select
                  id="decision-agenda-item"
                  onChange={(event) =>
                    updateDraft("agendaItemId", event.target.value)
                  }
                  value={draft.agendaItemId}
                >
                  <option value="">Intet dagsordenspunkt</option>
                  {agendaItemOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="decision-internal-note">
                  Intern note
                </label>
                <Textarea
                  id="decision-internal-note"
                  onChange={(event) =>
                    updateDraft("internalNote", event.target.value)
                  }
                  value={draft.internalNote}
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
              <Button
                disabled={saving}
                onClick={() => setDraft(null)}
                type="button"
                variant="secondary"
              >
                Annuller
              </Button>
              <Button disabled={saving} type="submit">
                {saving ? "Gemmer..." : "Gem beslutning"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
