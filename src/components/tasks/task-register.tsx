"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { TaskComments } from "@/components/tasks/task-comments";
import {
  Button,
  EmptyState,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import {
  filterTasks,
  getTaskDeadlineState,
  normalizeTaskCategory,
  taskBoardStatuses,
  taskStatusLabels,
  taskStatusOptions,
  taskStatusTones,
  type TaskFilters,
  type TaskStatus,
} from "@/lib/tasks";
import type {
  OrganizationMemberDirectoryEntry,
  TaskRegisterData,
  TaskView,
} from "@/types/domain";

type TaskDraft = {
  id?: string;
  committeeId: string;
  meetingId: string;
  agendaItemId: string;
  decisionId: string;
  title: string;
  description: string;
  status: TaskStatus;
  responsibleUserId: string;
  deadline: string;
  reminderAt: string;
  category: string;
  internalNote: string;
};

type TaskViewMode = "board" | "list";

const emptyDraft = (): TaskDraft => ({
  committeeId: "",
  meetingId: "",
  agendaItemId: "",
  decisionId: "",
  title: "",
  description: "",
  status: "not_started",
  responsibleUserId: "",
  deadline: "",
  reminderAt: "",
  category: "",
  internalNote: "",
});

const emptyFilters = (): TaskFilters => ({
  search: "",
  status: "",
  committeeId: "",
  responsibleUserId: "",
  category: "",
  showArchived: false,
});

function memberName(member: OrganizationMemberDirectoryEntry) {
  return member.full_name?.trim() || member.email;
}

function formatDate(value: string | null) {
  if (!value) return "Ingen deadline";
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function draftFromTask(task: TaskView): TaskDraft {
  return {
    id: task.id,
    committeeId: task.committee_id,
    meetingId: task.meeting_id ?? "",
    agendaItemId: task.agenda_item_id ?? "",
    decisionId: task.decision_id ?? "",
    title: task.title,
    description: task.description,
    status: task.status,
    responsibleUserId: task.responsible_user_id ?? "",
    deadline: task.deadline ?? "",
    reminderAt: toDateTimeLocal(task.reminder_at),
    category: task.category ?? "",
    internalNote: task.internal_note ?? "",
  };
}

export function TaskRegister({
  organizationId,
  data,
}: {
  organizationId: string;
  data: TaskRegisterData;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openedTaskParam = useRef<string | null>(null);
  const [tasks, setTasks] = useState(data.tasks);
  const [filters, setFilters] = useState<TaskFilters>(emptyFilters);
  const [viewMode, setViewMode] = useState<TaskViewMode>("board");
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [statusErrorId, setStatusErrorId] = useState<string | null>(null);

  useEffect(() => setTasks(data.tasks), [data.tasks]);

  useEffect(() => {
    const taskId = searchParams.get("editTask");
    if (!taskId || openedTaskParam.current === taskId) return;
    openedTaskParam.current = taskId;
    const task = data.tasks.find(
      (candidate) =>
        candidate.id === taskId &&
        data.editableCommitteeIds.includes(candidate.committee_id),
    );
    if (task) {
      setError(null);
      setFieldErrors({});
      setDraft(draftFromTask(task));
    }
  }, [data.editableCommitteeIds, data.tasks, searchParams]);

  const filteredTasks = useMemo(
    () => filterTasks(tasks, filters),
    [filters, tasks],
  );

  const categoryOptions = useMemo(() => {
    const categories = new Map<string, string>();
    for (const task of tasks) {
      const value = task.category?.trim();
      const normalized = normalizeTaskCategory(value);
      if (value && normalized && !categories.has(normalized)) {
        categories.set(normalized, value);
      }
    }
    return [...categories.values()].sort((left, right) =>
      left.localeCompare(right, "da-DK"),
    );
  }, [tasks]);

  const responsibleFilterOptions = useMemo(() => {
    const memberById = new Map(
      data.members.map((member) => [member.user_id, member]),
    );
    const responsible = new Map<string, string>();
    for (const task of tasks) {
      if (!task.responsible_user_id) continue;
      const member = memberById.get(task.responsible_user_id);
      responsible.set(
        task.responsible_user_id,
        task.responsible?.full_name ||
          (member ? memberName(member) : "Ukendt medlem"),
      );
    }
    return [...responsible.entries()].sort((left, right) =>
      left[1].localeCompare(right[1], "da-DK"),
    );
  }, [data.members, tasks]);

  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "" ||
    filters.committeeId !== "" ||
    filters.responsibleUserId !== "" ||
    filters.category !== "" ||
    filters.showArchived;

  function updateFilter<K extends keyof TaskFilters>(
    key: K,
    value: TaskFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const responsibleOptions = data.members.filter((member) =>
    member.committees.some(
      (committee) => committee.id === (draft?.committeeId ?? ""),
    ),
  );
  const meetingOptions = data.meetings.filter(
    (meeting) => meeting.committee_id === (draft?.committeeId ?? ""),
  );
  const agendaItemOptions = data.agendaItems.filter(
    (item) => item.committee_id === (draft?.committeeId ?? ""),
  );
  const decisionOptions = data.decisions.filter(
    (decision) => decision.committee_id === (draft?.committeeId ?? ""),
  );
  const canCreate = data.editableCommitteeIds.length > 0;

  function openCreate() {
    const next = emptyDraft();
    next.committeeId = data.editableCommitteeIds[0] ?? "";
    setError(null);
    setFieldErrors({});
    setDraft(next);
  }

  function updateDraft<K extends keyof TaskDraft>(
    key: K,
    value: TaskDraft[K],
  ) {
    setDraft((current) => {
      if (!current) return current;
      if (key === "committeeId") {
        return {
          ...current,
          committeeId: String(value),
          responsibleUserId: "",
          meetingId: "",
          agendaItemId: "",
          decisionId: "",
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
          ? `/api/tasks/${draft.id}`
          : `/api/organizations/${organizationId}/tasks`,
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            committeeId: draft.committeeId,
            meetingId: draft.meetingId || null,
            agendaItemId: draft.agendaItemId || null,
            decisionId: draft.decisionId || null,
            title: draft.title,
            description: draft.description,
            status: draft.status,
            responsibleUserId: draft.responsibleUserId || null,
            deadline: draft.deadline || null,
            reminderAt: draft.reminderAt
              ? new Date(draft.reminderAt).toISOString()
              : null,
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
        setError(result.error || "Opgaven kunne ikke gemmes.");
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
    task: TaskView,
    action: "archive" | "complete",
  ) {
    const question =
      action === "archive"
        ? `Vil du arkivere “${task.title}”?`
        : `Vil du markere “${task.title}” som gennemført?`;
    if (!window.confirm(question)) return;
    setActionId(task.id);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action }),
      });
      const result = (await response.json()) as Partial<TaskView> & {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error || "Handlingen kunne ikke gennemføres.");
        return;
      }
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, ...result } : item,
        ),
      );
      router.refresh();
    } catch {
      setError("Handlingen kunne ikke gennemføres. Prøv igen.");
    } finally {
      setActionId(null);
    }
  }

  async function changeStatus(task: TaskView, status: TaskStatus) {
    if (status === task.status) return;
    setActionId(task.id);
    setStatusErrorId(null);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          committeeId: task.committee_id,
          meetingId: task.meeting_id,
          agendaItemId: task.agenda_item_id,
          decisionId: task.decision_id,
          title: task.title,
          description: task.description,
          status,
          responsibleUserId: task.responsible_user_id,
          deadline: task.deadline,
          reminderAt: task.reminder_at,
          category: task.category,
          internalNote: task.internal_note,
        }),
      });
      const result = (await response.json()) as Partial<TaskView> & {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error || "Opgavens status kunne ikke ændres.");
        setStatusErrorId(task.id);
        return;
      }
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, ...result } : item,
        ),
      );
      router.refresh();
    } catch {
      setError("Opgavens status kunne ikke ændres. Prøv igen.");
      setStatusErrorId(task.id);
    } finally {
      setActionId(null);
    }
  }

  function taskCard(task: TaskView, compact: boolean) {
    const canEdit = data.editableCommitteeIds.includes(task.committee_id);
    const deadlineState = getTaskDeadlineState(task);
    return (
      <article
        className={
          compact
            ? "rounded-[var(--radius-control)] border border-line bg-surface p-3 shadow-sm"
            : "py-5"
        }
        id={`task-${task.id}`}
        key={task.id}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={compact ? "font-semibold" : "text-lg font-semibold"}>
                {task.title}
              </h2>
              {!compact ? (
                <StatusBadge tone={taskStatusTones[task.status]}>
                  {taskStatusLabels[task.status]}
                </StatusBadge>
              ) : null}
              {task.archived_at ? <StatusBadge>Arkiveret</StatusBadge> : null}
            </div>
            {!compact && task.description ? (
              <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-muted">
                {task.description}
              </p>
            ) : null}
            <dl
              className={
                compact
                  ? "mt-3 space-y-1.5 text-xs"
                  : "mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4"
              }
            >
              <div className={compact ? "flex justify-between gap-3" : ""}>
                <dt className="metadata">Udvalg</dt>
                <dd className={compact ? "truncate text-right" : ""}>
                  {task.committee?.name ?? "Ukendt udvalg"}
                </dd>
              </div>
              <div className={compact ? "flex justify-between gap-3" : ""}>
                <dt className="metadata">Ansvarlig</dt>
                <dd className={compact ? "truncate text-right" : ""}>
                  {task.responsible?.full_name || "Ikke angivet"}
                </dd>
              </div>
              <div className={compact ? "flex justify-between gap-3" : ""}>
                <dt className="metadata">Deadline</dt>
                <dd className="flex flex-wrap items-center justify-end gap-2">
                  <span>{formatDate(task.deadline)}</span>
                  {deadlineState === "overdue" ? (
                    <StatusBadge tone="danger">Overskredet</StatusBadge>
                  ) : null}
                  {deadlineState === "today" ? (
                    <StatusBadge tone="warning">I dag</StatusBadge>
                  ) : null}
                  {deadlineState === "soon" ? (
                    <StatusBadge tone="progress">Snart</StatusBadge>
                  ) : null}
                </dd>
              </div>
              <div className={compact ? "flex justify-between gap-3" : ""}>
                <dt className="metadata">Kategori</dt>
                <dd className={compact ? "truncate text-right" : ""}>
                  {task.category || "Ikke angivet"}
                </dd>
              </div>
              {task.reminder_at ? (
                <div className={compact ? "flex justify-between gap-3" : ""}>
                  <dt className="metadata">Påmindelse</dt>
                  <dd className={compact ? "truncate text-right" : ""}>
                    {new Intl.DateTimeFormat("da-DK", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(task.reminder_at))}
                  </dd>
                </div>
              ) : null}
            </dl>
            {!compact &&
            (task.meeting || task.agendaItem || task.decision) ? (
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                {task.meeting ? (
                  <Link
                    className="font-semibold text-brand hover:underline"
                    href={`/organizations/${organizationId}/committees/${task.committee_id}/meetings/${task.meeting.id}`}
                  >
                    Åbn møde: {task.meeting.title}
                  </Link>
                ) : null}
                {task.agendaItem ? (
                  <Link
                    className="font-semibold text-brand hover:underline"
                    href={`/organizations/${organizationId}/committees/${task.committee_id}/agenda-items/${task.agendaItem.id}`}
                  >
                    Åbn dagsordenspunkt: {task.agendaItem.title}
                  </Link>
                ) : null}
                {task.decision ? (
                  <Link
                    className="font-semibold text-brand hover:underline"
                    href={`/organizations/${organizationId}/decisions#decision-${task.decision.id}`}
                  >
                    Åbn beslutning: {task.decision.title}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {canEdit ? (
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
            <div className="min-w-40 flex-1">
              <label
                className="mb-1 block text-xs font-semibold text-muted"
                htmlFor={`task-status-quick-${task.id}`}
              >
                Flyt til status
              </label>
              <Select
                disabled={actionId === task.id}
                id={`task-status-quick-${task.id}`}
                onChange={(event) =>
                  void changeStatus(task, event.target.value as TaskStatus)
                }
                value={task.status}
              >
                {taskStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              onClick={() => {
                setError(null);
                setFieldErrors({});
                setDraft(draftFromTask(task));
              }}
              size="sm"
              variant="secondary"
            >
              Rediger
            </Button>
            {!task.archived_at ? (
              <Button
                disabled={actionId === task.id}
                onClick={() => performAction(task, "archive")}
                size="sm"
                variant="ghost"
              >
                Arkiver
              </Button>
            ) : null}
          </div>
        ) : null}
        {statusErrorId === task.id && error ? (
          <p className="mt-2 text-xs font-medium text-danger">{error}</p>
        ) : null}
      </article>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 border-y border-line py-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="label" htmlFor="task-search">
              Søg
            </label>
            <Input
              id="task-search"
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Søg i titel eller beskrivelse"
              value={filters.search}
            />
          </div>
          <div>
            <label className="label" htmlFor="task-status-filter">
              Status
            </label>
            <Select
              id="task-status-filter"
              onChange={(event) => updateFilter("status", event.target.value)}
              value={filters.status}
            >
              <option value="">Alle statusser</option>
              {taskStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="task-committee-filter">
              Udvalg
            </label>
            <Select
              id="task-committee-filter"
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
            <label className="label" htmlFor="task-responsible-filter">
              Ansvarlig
            </label>
            <Select
              id="task-responsible-filter"
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
            <label className="label" htmlFor="task-category-filter">
              Kategori
            </label>
            <Select
              id="task-category-filter"
              onChange={(event) =>
                updateFilter("category", event.target.value)
              }
              value={filters.category}
            >
              <option value="">Alle kategorier</option>
              {categoryOptions.map((category) => (
                <option key={normalizeTaskCategory(category)} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </div>
        </div>

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
              Vis arkiverede opgaver
            </label>
            <span className="text-sm text-muted">
              {filteredTasks.length} af {tasks.length} opgaver
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
          <div className="flex flex-wrap gap-2">
            <div
              aria-label="Vælg opgavevisning"
              className="flex rounded-[var(--radius-control)] border border-line-strong bg-surface p-1"
              role="group"
            >
              <Button
                aria-pressed={viewMode === "board"}
                onClick={() => setViewMode("board")}
                size="sm"
                variant={viewMode === "board" ? "primary" : "ghost"}
              >
                Task View
              </Button>
              <Button
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                size="sm"
                variant={viewMode === "list" ? "primary" : "ghost"}
              >
                Liste
              </Button>
            </div>
            <Button disabled={!canCreate} onClick={openCreate}>
              Opret opgave
            </Button>
          </div>
        </div>
      </div>

      {error && !draft && !statusErrorId ? (
        <div className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {filteredTasks.length ? (
        viewMode === "board" ? (
          <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-5">
            {taskBoardStatuses.map((status) => {
              const columnTasks = filteredTasks.filter(
                (task) => task.status === status,
              );
              return (
                <section
                  className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-subtle/45"
                  key={status}
                >
                  <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                    <StatusBadge tone={taskStatusTones[status]}>
                      {taskStatusLabels[status]}
                    </StatusBadge>
                    <span className="text-xs font-semibold text-muted">
                      {columnTasks.length}
                    </span>
                  </header>
                  <div className="space-y-2 p-2.5">
                    {columnTasks.length ? (
                      columnTasks.map((task) => taskCard(task, true))
                    ) : (
                      <EmptyState
                        compact
                        description="Opgaver vises her, når de får denne status."
                        title="Ingen opgaver"
                      />
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="divide-y divide-line border-y border-line">
            {filteredTasks.map((task) => taskCard(task, false))}
          </div>
        )
      ) : (
        <EmptyState
          description={
            tasks.length && hasActiveFilters
              ? "Ingen opgaver matcher de valgte filtre. Ryd et eller flere filtre for at udvide visningen."
              : tasks.length
                ? "Der er ingen aktive opgaver at vise. Arkiverede opgaver kan vises via filteret."
              : canCreate
                ? "Opret den første opgave og gør ansvar og deadline tydelig."
                : "Der er endnu ikke registreret opgaver i de udvalg, du har adgang til."
          }
          title={
            hasActiveFilters
              ? "Ingen opgaver matcher filtrene."
              : "Der er ingen opgaver at vise."
          }
        />
      )}

      <Modal
        description="Opgaven knyttes til et udvalg og bruges til konkret handling og opfølgning."
        maxWidth="3xl"
        onClose={() => setDraft(null)}
        open={Boolean(draft)}
        title={draft?.id ? "Rediger opgave" : "Opret opgave"}
      >
        {draft ? (
          <div className="space-y-5">
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
                <label className="label" htmlFor="task-title">
                  Titel
                </label>
                <Input
                  id="task-title"
                  onChange={(event) => updateDraft("title", event.target.value)}
                  value={draft.title}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="task-description">
                  Beskrivelse
                </label>
                <Textarea
                  id="task-description"
                  onChange={(event) =>
                    updateDraft("description", event.target.value)
                  }
                  value={draft.description}
                />
              </div>
              <div>
                <label className="label" htmlFor="task-committee">
                  Udvalg
                </label>
                <Select
                  id="task-committee"
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
                <label className="label" htmlFor="task-status">
                  Status
                </label>
                <Select
                  id="task-status"
                  onChange={(event) =>
                    updateDraft("status", event.target.value as TaskStatus)
                  }
                  value={draft.status}
                >
                  {taskStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="label" htmlFor="task-responsible">
                  Ansvarlig
                </label>
                <Select
                  id="task-responsible"
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
                <label className="label" htmlFor="task-deadline">
                  Deadline
                </label>
                <Input
                  id="task-deadline"
                  onChange={(event) =>
                    updateDraft("deadline", event.target.value)
                  }
                  type="date"
                  value={draft.deadline}
                />
              </div>
              <div>
                <label className="label" htmlFor="task-category">
                  Kategori
                </label>
                <Input
                  id="task-category"
                  onChange={(event) =>
                    updateDraft("category", event.target.value)
                  }
                  value={draft.category}
                />
              </div>
              <div>
                <label className="label" htmlFor="task-reminder">
                  Påmindelse
                </label>
                <Input
                  id="task-reminder"
                  onChange={(event) =>
                    updateDraft("reminderAt", event.target.value)
                  }
                  type="datetime-local"
                  value={draft.reminderAt}
                />
                <p className="mt-1 text-xs text-muted">
                  Gemmes til senere email/notifikation. Der sendes ikke
                  automatisk noget endnu.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="task-meeting">
                  Relateret møde
                </label>
                <Select
                  id="task-meeting"
                  onChange={(event) =>
                    updateDraft("meetingId", event.target.value)
                  }
                  value={draft.meetingId}
                >
                  <option value="">Intet møde</option>
                  {meetingOptions.map((meeting) => (
                    <option key={meeting.id} value={meeting.id}>
                      {meeting.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="label" htmlFor="task-agenda-item">
                  Relateret dagsordenspunkt
                </label>
                <Select
                  id="task-agenda-item"
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
              <div>
                <label className="label" htmlFor="task-decision">
                  Relateret beslutning
                </label>
                <Select
                  id="task-decision"
                  onChange={(event) =>
                    updateDraft("decisionId", event.target.value)
                  }
                  value={draft.decisionId}
                >
                  <option value="">Ingen beslutning</option>
                  {decisionOptions.map((decision) => (
                    <option key={decision.id} value={decision.id}>
                      {decision.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="task-internal-note">
                  Intern note
                </label>
                <Textarea
                  id="task-internal-note"
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
                  {saving ? "Gemmer..." : "Gem opgave"}
                </Button>
              </div>
            </form>
            {draft.id ? (
              <TaskComments
                organizationId={organizationId}
                taskId={draft.id}
              />
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
