"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  annualWheelDeadlineState,
  annualWheelPriorityLabels,
  annualWheelRecurrenceLabels,
  canEditAnnualWheelEvent,
  type AnnualWheelPriority,
  type AnnualWheelRecurrence,
} from "@/lib/annual-wheel";
import {
  annualWheelSearchParams,
  parseAnnualWheelState,
  type AnnualWheelKind,
  type AnnualWheelState,
  type AnnualWheelView,
} from "@/lib/annual-wheel-state";
import {
  Button,
  buttonClassName,
  EmptyState,
  Input,
  Modal,
  MutationFeedback,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import type {
  AnnualWheelCalendarItem,
  AnnualWheelEventView,
  AnnualWheelOverview,
} from "@/types/domain";
import {
  focusInvalidField,
  useMutationFeedback,
  useUnsavedChanges,
  type MutationFeedbackState,
} from "@/hooks/use-mutation-feedback";
import {
  firstFieldError,
  MutationRequestError,
  readMutationResponse,
} from "@/lib/mutation-feedback";

type AiResult = {
  activitySuggestions: Array<{
    title: string;
    description: string;
    suggestedMonth: number;
    category: string;
    priority: AnnualWheelPriority;
    rationale: string;
    sourceIds: string[];
  }>;
  agendaSuggestions: Array<{
    title: string;
    rationale: string;
    sourceIds: string[];
  }>;
  sources: Array<{ id: string; label: string }>;
};
type EventDraft = {
  id?: string;
  committeeId: string;
  title: string;
  description: string;
  startsOn: string;
  endsOn: string;
  responsibleUserId: string;
  category: string;
  priority: AnnualWheelPriority;
  status: AnnualWheelEventView["status"];
  recurrence: AnnualWheelRecurrence;
  recurrenceInterval: number;
  taskTemplates: TaskTemplateDraft[];
  keyPeople: KeyPersonDraft[];
};
type TaskTemplateDraft = {
  id?: string;
  title: string;
  description: string;
  suggestedResponsibleUserId: string;
  deadlineAnchor: "start" | "end";
  deadlineOffsetDays: number | null;
};
type KeyPersonDraft = {
  id?: string;
  userId: string;
  name: string;
  roleTitle: string;
  phone: string;
  email: string;
};

const monthNames = [
  "Januar",
  "Februar",
  "Marts",
  "April",
  "Maj",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "December",
];

const kindLabels = {
  activity: "Aktivitet",
  meeting: "Møde",
  task: "Opgave",
  decision: "Beslutningsdeadline",
} as const;

const eventStatusLabels: Record<AnnualWheelEventView["status"], string> = {
  planned: "Planlagt",
  in_progress: "I gang",
  completed: "Gennemført",
  postponed: "Udsat",
  cancelled: "Annulleret",
};

const taskStatusLabels: Record<string, string> = {
  not_started: "Ikke startet",
  todo: "Aktiv",
  pending: "Aktiv",
  in_progress: "I gang",
  waiting: "Afventer",
  completed: "Gennemført",
  cancelled: "Annulleret",
};

type AnnualWheelTimelineItem =
  | {
      id: string;
      kind: "activity";
      title: string;
      date: string;
      committeeId: string | null;
      responsibleUserId: string | null;
      priority: AnnualWheelPriority;
      event: AnnualWheelEventView;
      href: null;
    }
  | (AnnualWheelCalendarItem & {
      event: null;
    });

function getMonthItems(items: AnnualWheelTimelineItem[], month: number) {
  return items.filter((item) => Number(item.date.slice(5, 7)) - 1 === month);
}

function splitMonthItems(items: AnnualWheelTimelineItem[]) {
  return {
    meetings: items.filter((item) => item.kind === "meeting"),
    activities: items.filter((item) => item.kind === "activity"),
    otherItems: items.filter(
      (item) => item.kind !== "meeting" && item.kind !== "activity",
    ),
  };
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function emptyDraft(defaultCommitteeId = ""): EventDraft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    committeeId: defaultCommitteeId,
    title: "",
    description: "",
    startsOn: today,
    endsOn: today,
    responsibleUserId: "",
    category: "",
    priority: "medium",
    status: "planned",
    recurrence: "none",
    recurrenceInterval: 1,
    taskTemplates: [],
    keyPeople: [],
  };
}

function draftFromEvent(event: AnnualWheelEventView): EventDraft {
  return {
    id: event.id,
    committeeId: event.committee_id ?? "",
    title: event.title,
    description: event.description,
    startsOn: event.starts_on,
    endsOn: event.ends_on,
    responsibleUserId: event.responsible_user_id ?? "",
    category: event.category ?? "",
    priority: event.priority,
    status: event.status,
    recurrence: event.recurrence,
    recurrenceInterval: event.recurrence_interval,
    taskTemplates: event.taskTemplates.map((template) => ({
      id: template.id,
      title: template.title,
      description: template.description,
      suggestedResponsibleUserId: template.suggested_responsible_user_id ?? "",
      deadlineAnchor: template.deadline_anchor,
      deadlineOffsetDays: template.deadline_offset_days,
    })),
    keyPeople: event.keyPeople.map((person) => ({
      id: person.id,
      userId: person.user_id ?? "",
      name: person.name,
      roleTitle: person.role_title,
      phone: person.phone ?? "",
      email: person.email ?? "",
    })),
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function annualWheelTaskDeadlineLabel(
  template: Pick<TaskTemplateDraft, "deadlineAnchor" | "deadlineOffsetDays">,
  event: Pick<EventDraft, "startsOn" | "endsOn">,
) {
  if (template.deadlineOffsetDays === null) return "Ingen relativ deadline";
  const anchorLabel = template.deadlineAnchor === "start" ? "start" : "slut";
  const anchorDate =
    template.deadlineAnchor === "start" ? event.startsOn : event.endsOn;
  const calculatedDate = addDays(anchorDate, template.deadlineOffsetDays);
  if (template.deadlineOffsetDays === 0) {
    return `På ${anchorLabel} · ${formatCompactDate(calculatedDate)}`;
  }
  const direction = template.deadlineOffsetDays < 0 ? "før" : "efter";
  return `${Math.abs(template.deadlineOffsetDays)} dage ${direction} ${anchorLabel} · ${formatCompactDate(calculatedDate)}`;
}

function eventIsOverdue(event: AnnualWheelEventView) {
  return (
    annualWheelDeadlineState(event.ends_on, event.priority) === "overdue" &&
    !["completed", "cancelled"].includes(event.status)
  );
}

export function AnnualWheel({
  organizationId,
  data,
  initialCommitteeId = "",
}: {
  organizationId: string;
  data: AnnualWheelOverview;
  initialCommitteeId?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialState = parseAnnualWheelState(
    new URLSearchParams(searchParams.toString()),
    initialCommitteeId,
  );
  const [view, setView] = useState<AnnualWheelView>(initialState.view);
  const [focusMonth, setFocusMonth] = useState(initialState.focusMonth);
  const [committeeId, setCommitteeId] = useState(initialState.committeeId);
  const [responsibleId, setResponsibleId] = useState(
    initialState.responsibleId,
  );
  const [kind, setKind] = useState<AnnualWheelKind>(initialState.kind);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [draftBaseline, setDraftBaseline] = useState<EventDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const mutation = useMutationFeedback();
  const draftIsDirty =
    Boolean(draft && draftBaseline) &&
    JSON.stringify(draft) !== JSON.stringify(draftBaseline);
  const confirmDiscard = useUnsavedChanges(
    draftIsDirty && !mutation.pending && !saving,
  );

  useEffect(() => {
    const next = parseAnnualWheelState(
      new URLSearchParams(searchParams.toString()),
      initialCommitteeId,
    );
    setView(next.view);
    setFocusMonth(next.focusMonth);
    setCommitteeId(next.committeeId);
    setResponsibleId(next.responsibleId);
    setKind(next.kind);
  }, [initialCommitteeId, searchParams]);

  const canCreate =
    data.canEditOrganization || data.editableCommitteeIds.length > 0;
  const visibleMonths =
    view === "year"
      ? monthNames.map((_, index) => index)
      : view === "quarter"
        ? [0, 1, 2].map((offset) => Math.floor(focusMonth / 3) * 3 + offset)
        : [focusMonth];

  const items = useMemo<AnnualWheelTimelineItem[]>(() => {
    const activities = data.events.map((event) => ({
      id: event.id,
      kind: "activity" as const,
      title: event.title,
      date: event.starts_on,
      committeeId: event.committee_id,
      responsibleUserId: event.responsible_user_id,
      priority: event.priority,
      event,
      href: null,
    }));
    const calendar = data.calendarItems.map((item) => ({
      ...item,
      event: null,
    }));
    return [...activities, ...calendar]
      .filter((item) => !committeeId || item.committeeId === committeeId)
      .filter(
        (item) => !responsibleId || item.responsibleUserId === responsibleId,
      )
      .filter((item) => !kind || item.kind === kind)
      .sort((left, right) => left.date.localeCompare(right.date));
  }, [committeeId, data.calendarItems, data.events, kind, responsibleId]);

  const deadlines = items
    .filter(
      (item) =>
        item.kind !== "meeting" &&
        visibleMonths.includes(Number(item.date.slice(5, 7)) - 1),
    )
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 12);

  const selectedMonthItems =
    selectedMonth === null ? [] : getMonthItems(items, selectedMonth);
  const selectedMonthGroups = splitMonthItems(selectedMonthItems);
  const visibleItemCount = items.filter((item) =>
    visibleMonths.includes(Number(item.date.slice(5, 7)) - 1),
  ).length;
  const hasActiveFilters =
    committeeId !== initialCommitteeId || responsibleId !== "" || kind !== "";
  const selectedScopeLabel = committeeId
    ? (data.committees.find((committee) => committee.id === committeeId)
        ?.name ?? "Valgt udvalg")
    : initialCommitteeId
      ? (data.committees.find(
          (committee) => committee.id === initialCommitteeId,
        )?.name ?? "Valgt udvalg")
      : "Organisationen og alle synlige udvalg";
  const selectedPeriodLabel =
    view === "year"
      ? `Hele ${data.year}`
      : view === "quarter"
        ? `${Math.floor(focusMonth / 3) + 1}. kvartal ${data.year}`
        : `${monthNames[focusMonth]} ${data.year}`;

  function replaceAnnualWheelState(patch: Partial<AnnualWheelState>) {
    const nextState: AnnualWheelState = {
      view,
      focusMonth,
      committeeId,
      responsibleId,
      kind,
      ...patch,
    };
    setView(nextState.view);
    setFocusMonth(nextState.focusMonth);
    setCommitteeId(nextState.committeeId);
    setResponsibleId(nextState.responsibleId);
    setKind(nextState.kind);
    const next = annualWheelSearchParams(
      new URLSearchParams(searchParams.toString()),
      nextState,
      initialCommitteeId,
    );
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function resetFilters() {
    replaceAnnualWheelState({
      committeeId: initialCommitteeId,
      responsibleId: "",
      kind: "",
    });
  }

  function yearHref(year: number) {
    const next = annualWheelSearchParams(
      new URLSearchParams(searchParams.toString()),
      { view, focusMonth, committeeId, responsibleId, kind },
      initialCommitteeId,
    );
    next.set("year", String(year));
    return `${pathname}?${next.toString()}`;
  }

  function eventCanEdit(event: AnnualWheelEventView) {
    return canEditAnnualWheelEvent(
      data.canEditOrganization,
      data.editableCommitteeIds,
      event.committee_id,
    );
  }

  function itemHref(item: AnnualWheelTimelineItem) {
    if (item.kind === "task") {
      const taskId = item.id.startsWith("task:") ? item.id.slice(5) : "";
      return taskId
        ? `/organizations/${organizationId}/tasks?editTask=${taskId}#task-${taskId}`
        : item.href;
    }
    return item.href;
  }

  function renderTimelineItem(
    item: AnnualWheelTimelineItem,
    variant: "card" | "detail" = "card",
  ) {
    const taskStatus =
      item.kind === "task" && "status" in item ? item.status : null;
    const closedTask =
      item.kind === "task" &&
      (taskStatus === "completed" || taskStatus === "cancelled");
    const state =
      item.kind === "meeting"
        ? null
        : closedTask
          ? null
          : item.event && ["completed", "cancelled"].includes(item.event.status)
            ? null
            : annualWheelDeadlineState(item.date, item.priority);
    const scopeLabel = item.committeeId
      ? `Udvalg · ${
          data.committees.find((committee) => committee.id === item.committeeId)
            ?.name ?? "Ukendt udvalg"
        }`
      : "Organisation";
    const responsibleLabel = item.responsibleUserId
      ? data.members.find((member) => member.user_id === item.responsibleUserId)
          ?.full_name ||
        data.members.find((member) => member.user_id === item.responsibleUserId)
          ?.email ||
        "Ukendt ansvarlig"
      : "Ingen ansvarlig";
    const content = (
      <>
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span className="mt-0.5 w-12 shrink-0 text-xs font-semibold text-muted">
            {variant === "detail"
              ? shortDate(item.date)
              : item.date.slice(8, 10)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium text-ink">
              {item.title}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <StatusBadge tone="neutral">{scopeLabel}</StatusBadge>
              <span>Ansvarlig: {responsibleLabel}</span>
              {item.kind === "meeting" ? (
                <StatusBadge tone="neutral">Møde</StatusBadge>
              ) : (
                <span>{kindLabels[item.kind]}</span>
              )}
              {taskStatus ? (
                <StatusBadge
                  tone={
                    taskStatus === "completed"
                      ? "success"
                      : taskStatus === "cancelled"
                        ? "neutral"
                        : "info"
                  }
                >
                  {taskStatusLabels[taskStatus] ?? "Aktiv"}
                </StatusBadge>
              ) : null}
              {item.kind === "activity" ? (
                <span>{annualWheelPriorityLabels[item.priority]}</span>
              ) : null}
              {item.event ? (
                <StatusBadge
                  tone={
                    item.event.status === "completed"
                      ? "success"
                      : item.event.status === "cancelled"
                        ? "neutral"
                        : "info"
                  }
                >
                  {eventStatusLabels[item.event.status]}
                </StatusBadge>
              ) : null}
              {item.event && eventIsOverdue(item.event) ? (
                <StatusBadge tone="danger">Forsinket</StatusBadge>
              ) : state === "overdue" ? (
                <StatusBadge tone="danger">Forsinket</StatusBadge>
              ) : state === "critical" ? (
                <StatusBadge tone="warning">Kritisk</StatusBadge>
              ) : null}
            </div>
          </div>
        </div>
      </>
    );

    const rowClass =
      "group flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left transition hover:bg-subtle focus:outline-none focus:ring-2 focus:ring-brand/30";

    if (item.event) {
      return (
        <button
          className={rowClass}
          key={item.id}
          onClick={() => {
            setSelectedMonth(null);
            openEdit(item.event);
          }}
          type="button"
        >
          {content}
        </button>
      );
    }

    const href = itemHref(item);
    if (!href) {
      return (
        <div className={rowClass} key={item.id}>
          {content}
        </div>
      );
    }

    return (
      <Link className={rowClass} href={href} key={item.id}>
        {content}
      </Link>
    );
  }

  function renderMonthList(
    meetings: AnnualWheelTimelineItem[],
    otherItems: AnnualWheelTimelineItem[],
    variant: "card" | "detail" = "card",
  ) {
    const visibleMeetings =
      variant === "card" ? meetings.slice(0, 3) : meetings;
    const visibleOtherItems =
      variant === "card"
        ? otherItems.slice(0, Math.max(0, 5 - visibleMeetings.length))
        : otherItems;
    const hiddenCount =
      meetings.length +
      otherItems.length -
      visibleMeetings.length -
      visibleOtherItems.length;

    return (
      <div className="mt-3 space-y-1">
        {visibleMeetings.map((item) => renderTimelineItem(item, variant))}
        {meetings.length > 0 && otherItems.length > 0 ? (
          <div className="flex items-center gap-2 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            <span className="h-px flex-1 border-t border-dashed border-line" />
            <span>Opgaver og deadlines</span>
            <span className="h-px flex-1 border-t border-dashed border-line" />
          </div>
        ) : null}
        {visibleOtherItems.map((item) => renderTimelineItem(item, variant))}
        {hiddenCount > 0 ? (
          <button
            className="px-2 py-1 text-sm font-medium text-brand hover:underline"
            onClick={() => {
              const month = Number(
                [...meetings, ...otherItems][0]?.date.slice(5, 7),
              );
              if (month) setSelectedMonth(month - 1);
            }}
            type="button"
          >
            + {hiddenCount} flere
          </button>
        ) : null}
      </div>
    );
  }

  function openCreate() {
    const defaultCommittee =
      initialCommitteeId ||
      (data.canEditOrganization ? "" : (data.editableCommitteeIds[0] ?? ""));
    setError(null);
    setNotice(null);
    setFieldErrors({});
    const nextDraft = emptyDraft(defaultCommittee);
    mutation.reset();
    setDraftBaseline(nextDraft);
    setDraft(nextDraft);
  }

  function openEdit(event: AnnualWheelEventView) {
    setError(null);
    setNotice(null);
    setFieldErrors({});
    const nextDraft = draftFromEvent(event);
    mutation.reset();
    setDraftBaseline(nextDraft);
    setDraft(nextDraft);
  }

  function closeDraft() {
    if (!confirmDiscard()) return;
    setDraft(null);
    setDraftBaseline(null);
    setError(null);
    setFieldErrors({});
  }

  async function analyzeAnnualWheel() {
    setAiLoading(true);
    setAiError(null);
    const response = await fetch(
      `/api/organizations/${organizationId}/annual-wheel/suggestions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          committeeId: committeeId || null,
          year: data.year,
        }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    setAiLoading(false);
    if (!response.ok) {
      setAiError(payload.error ?? "AI kunne ikke analysere årshjulet.");
      return;
    }
    setAiResult(payload as AiResult);
  }

  function applyAiSuggestion(
    suggestion: AiResult["activitySuggestions"][number],
  ) {
    const month = String(suggestion.suggestedMonth).padStart(2, "0");
    const startsOn = `${data.year}-${month}-01`;
    const baseline = emptyDraft(
      committeeId ||
        initialCommitteeId ||
        (data.canEditOrganization ? "" : (data.editableCommitteeIds[0] ?? "")),
    );
    mutation.reset();
    setDraftBaseline(baseline);
    setDraft({
      ...baseline,
      title: suggestion.title,
      description: suggestion.description,
      startsOn,
      endsOn: startsOn,
      category: suggestion.category,
      priority: suggestion.priority,
      status: "planned",
      taskTemplates: [],
      keyPeople: [],
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!mutation.begin("Aktiviteten gemmes...")) return;
    setError(null);
    setFieldErrors({});
    try {
      await readMutationResponse(
        await fetch(
          draft.id
            ? `/api/annual-wheel/${draft.id}`
            : `/api/organizations/${organizationId}/annual-wheel`,
          {
            method: draft.id ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              organizationId,
              committeeId: draft.committeeId || null,
              title: draft.title,
              description: draft.description,
              startsOn: draft.startsOn,
              endsOn: draft.endsOn,
              responsibleUserId: draft.responsibleUserId || null,
              category: draft.category || null,
              priority: draft.priority,
              status: draft.status,
              recurrence: draft.recurrence,
              recurrenceInterval: draft.recurrenceInterval,
              taskTemplates: draft.taskTemplates.map((template) => ({
                id: template.id,
                title: template.title,
                description: template.description,
                suggestedResponsibleUserId:
                  template.suggestedResponsibleUserId || null,
                deadlineAnchor: template.deadlineAnchor,
                deadlineOffsetDays: template.deadlineOffsetDays,
              })),
              keyPeople: draft.keyPeople.map((person) => ({
                id: person.id,
                userId: person.userId || null,
                name: person.name,
                roleTitle: person.roleTitle,
                phone: person.phone || null,
                email: person.email || null,
              })),
            }),
          },
        ),
        "Aktiviteten kunne ikke gemmes. Prøv igen.",
      );
      setDraftBaseline(null);
      setDraft(null);
      mutation.succeed("Aktiviteten er gemt.");
      router.refresh();
    } catch (caught) {
      if (caught instanceof MutationRequestError) {
        setFieldErrors(caught.fieldErrors);
        mutation.fail(caught.message);
        focusInvalidField(
          firstFieldError(caught.fieldErrors, [
            "title",
            "startsOn",
            "endsOn",
            "committeeId",
            "responsibleUserId",
          ])
            ? `annual-wheel-${firstFieldError(caught.fieldErrors, [
                "title",
                "startsOn",
                "endsOn",
                "committeeId",
                "responsibleUserId",
              ])}`
            : null,
        );
      } else {
        mutation.fail(
          "Forbindelsen til serveren mislykkedes. Kontrollér din internetforbindelse, og prøv igen.",
        );
      }
    }
  }

  async function activateTasks(eventId: string) {
    setActivating(true);
    setError(null);
    setNotice(null);
    const response = await fetch(
      `/api/annual-wheel/${eventId}/activate-tasks`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, year: data.year }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    setActivating(false);
    if (!response.ok) {
      setError(payload.error ?? "Opgaverne kunne ikke aktiveres.");
      return;
    }
    const createdCount = Array.isArray(payload.created)
      ? payload.created.length
      : 0;
    setNotice(
      createdCount
        ? `${createdCount} opgaver er aktiveret for ${data.year}.`
        : `Opgaverne var allerede aktiveret for ${data.year}.`,
    );
    router.refresh();
  }

  async function remove() {
    if (!draft?.id || !window.confirm("Vil du fjerne denne forekomst?")) return;
    setSaving(true);
    const response = await fetch(`/api/annual-wheel/${draft.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(payload.error ?? "Aktiviteten kunne ikke fjernes.");
      return;
    }
    setDraft(null);
    setDraftBaseline(null);
    router.refresh();
  }

  const responsibleOptions = data.members.filter(
    (member) =>
      member.status === "active" &&
      (!draft?.committeeId ||
        member.committees.some(
          (committee) => committee.id === draft.committeeId,
        )),
  );
  const draftEvent = draft?.id
    ? (data.events.find((event) => event.id === draft.id) ?? null)
    : null;

  return (
    <div className="content-flow">
      <div className="section-header border-b border-line pb-4">
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <Link
            className="button-secondary justify-center"
            href={yearHref(data.year - 1)}
          >
            ← {data.year - 1}
          </Link>
          <div
            aria-label="Vælg periodevisning"
            className="order-3 col-span-2 grid grid-cols-3 gap-2 sm:order-none sm:flex sm:flex-wrap"
            role="group"
          >
            {(["year", "quarter", "month"] as const).map((mode) => (
              <Button
                aria-pressed={view === mode}
                key={mode}
                onClick={() => replaceAnnualWheelState({ view: mode })}
                variant={view === mode ? "primary" : "secondary"}
              >
                <span className="sm:hidden">
                  {mode === "year"
                    ? "År"
                    : mode === "quarter"
                      ? "Kvartal"
                      : "Måned"}
                </span>
                <span className="hidden sm:inline">
                  {mode === "year"
                    ? "Årsvisning"
                    : mode === "quarter"
                      ? "Kvartalsvisning"
                      : "Månedsvisning"}
                </span>
              </Button>
            ))}
          </div>
          <Link
            className="button-secondary justify-center"
            href={yearHref(data.year + 1)}
          >
            {data.year + 1} →
          </Link>
        </div>
        <div className="action-cluster hidden sm:flex sm:justify-end">
          <Link
            className={buttonClassName({
              size: "sm",
              variant: "secondary",
            })}
            href={`/api/organizations/${organizationId}/annual-wheel/pdf/overview?year=${data.year}${committeeId ? `&committeeId=${committeeId}` : ""}`}
          >
            Download overblik som PDF
          </Link>
          <Link
            className={buttonClassName({
              size: "sm",
              variant: "secondary",
            })}
            href={`/api/organizations/${organizationId}/annual-wheel/pdf/wheel?year=${data.year}${committeeId ? `&committeeId=${committeeId}` : ""}`}
          >
            Download årshjul som PDF
          </Link>
          {canCreate ? (
            <Button onClick={openCreate}>Opret aktivitet</Button>
          ) : null}
        </div>
        <div className="flex w-full items-start gap-2 sm:hidden">
          <details className="relative flex-1 rounded-[var(--radius-control)] border border-line bg-surface">
            <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-center text-sm font-semibold">
              Eksportér PDF
            </summary>
            <div className="space-y-2 border-t border-line p-2">
              <Link
                className={buttonClassName({
                  size: "sm",
                  variant: "secondary",
                })}
                href={`/api/organizations/${organizationId}/annual-wheel/pdf/overview?year=${data.year}${committeeId ? `&committeeId=${committeeId}` : ""}`}
              >
                Download overblik
              </Link>
              <Link
                className={buttonClassName({
                  size: "sm",
                  variant: "secondary",
                })}
                href={`/api/organizations/${organizationId}/annual-wheel/pdf/wheel?year=${data.year}${committeeId ? `&committeeId=${committeeId}` : ""}`}
              >
                Download årshjul
              </Link>
            </div>
          </details>
          {canCreate ? (
            <Button className="flex-1" onClick={openCreate}>
              Opret aktivitet
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Select
          aria-label="Filtrér på udvalg"
          disabled={Boolean(initialCommitteeId)}
          onChange={(event) =>
            replaceAnnualWheelState({ committeeId: event.target.value })
          }
          value={committeeId}
        >
          {initialCommitteeId ? null : (
            <option value="">Alle udvalg og organisationen</option>
          )}
          {data.committees
            .filter(
              (committee) =>
                !initialCommitteeId || committee.id === initialCommitteeId,
            )
            .map((committee) => (
              <option key={committee.id} value={committee.id}>
                {committee.name}
              </option>
            ))}
        </Select>
        <Select
          aria-label="Filtrér på ansvarlig"
          onChange={(event) =>
            replaceAnnualWheelState({ responsibleId: event.target.value })
          }
          value={responsibleId}
        >
          <option value="">Alle ansvarlige</option>
          {data.members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.full_name || member.email}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filtrér på aktivitetstype"
          onChange={(event) =>
            replaceAnnualWheelState({
              kind: event.target.value as AnnualWheelKind,
            })
          }
          value={kind}
        >
          <option value="">Alle typer</option>
          <option value="activity">Aktiviteter</option>
          <option value="meeting">Møder</option>
          <option value="task">Opgaver</option>
          <option value="decision">Beslutningsdeadlines</option>
        </Select>
        <Select
          aria-label="Vælg måned"
          disabled={view === "year"}
          onChange={(event) =>
            replaceAnnualWheelState({
              focusMonth: Number(event.target.value),
            })
          }
          value={focusMonth}
        >
          {monthNames.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </Select>
      </div>
      <div aria-live="polite" className="filter-result-bar">
        <p>
          <span className="font-semibold">{visibleItemCount} elementer</span>
          <span className="text-muted">
            {" "}
            · {selectedPeriodLabel} · {selectedScopeLabel}
          </span>
        </p>
        {hasActiveFilters ? (
          <Button onClick={resetFilters} size="sm" variant="secondary">
            Nulstil filtre
          </Button>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-[var(--radius-panel)] border border-brand/20 bg-surface">
        <div className="section-header bg-brand-soft px-4 py-4">
          <div>
            <p className="page-eyebrow">AI-planlægningsassistent</p>
            <h2 className="mt-1 font-semibold">Find mangler i årets plan</h2>
            <p className="mt-1 text-sm text-muted">
              AI foreslår aktiviteter og dagsordenspunkter. Intet oprettes uden
              din godkendelse.
            </p>
          </div>
          <Button
            disabled={aiLoading}
            onClick={() => void analyzeAnnualWheel()}
            variant="secondary"
          >
            {aiLoading ? "Analyserer..." : "Analysér årshjul"}
          </Button>
        </div>
        {aiError ? (
          <div className="m-4 alert-danger p-3 text-sm">
            {aiError}{" "}
            <button
              className="font-semibold underline"
              onClick={() => void analyzeAnnualWheel()}
              type="button"
            >
              Prøv igen
            </button>
          </div>
        ) : null}
        {aiResult ? (
          <div className="grid gap-6 p-4 lg:grid-cols-2">
            <div>
              <h3 className="font-semibold">Foreslåede aktiviteter</h3>
              {aiResult.activitySuggestions.length ? (
                <div className="mt-3 divide-y divide-line">
                  {aiResult.activitySuggestions.map((suggestion) => (
                    <div className="py-3" key={suggestion.title}>
                      <p className="font-medium">{suggestion.title}</p>
                      <p className="mt-1 text-sm text-muted">
                        {suggestion.rationale}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Foreslået måned:{" "}
                        {monthNames[suggestion.suggestedMonth - 1]}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Kilder:{" "}
                        {suggestion.sourceIds
                          .map(
                            (sourceId) =>
                              aiResult.sources.find(
                                (source) => source.id === sourceId,
                              )?.label,
                          )
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                      {canCreate ? (
                        <Button
                          className="mt-2"
                          onClick={() => applyAiSuggestion(suggestion)}
                          size="sm"
                          variant="secondary"
                        >
                          Gennemgå og opret
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">
                  AI fandt ingen tydelige mangler.
                </p>
              )}
            </div>
            <div>
              <h3 className="font-semibold">Forslag til dagsorden</h3>
              {aiResult.agendaSuggestions.length ? (
                <div className="mt-3 divide-y divide-line">
                  {aiResult.agendaSuggestions.map((suggestion) => (
                    <div className="py-3" key={suggestion.title}>
                      <p className="font-medium">{suggestion.title}</p>
                      <p className="mt-1 text-sm text-muted">
                        {suggestion.rationale}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Kilder:{" "}
                        {suggestion.sourceIds
                          .map(
                            (sourceId) =>
                              aiResult.sources.find(
                                (source) => source.id === sourceId,
                              )?.label,
                          )
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">
                  Ingen dagsordenforslag i den valgte kontekst.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {visibleItemCount === 0 ? (
        <EmptyState
          action={
            hasActiveFilters ? (
              <Button onClick={resetFilters} variant="secondary">
                Nulstil filtre
              </Button>
            ) : canCreate ? (
              <Button onClick={openCreate}>Opret første aktivitet</Button>
            ) : undefined
          }
          description={
            hasActiveFilters
              ? "Der findes ingen elementer, som matcher de valgte filtre i perioden."
              : "Der er endnu ikke planlagt aktiviteter, møder, opgaver eller beslutningsdeadlines i perioden."
          }
          kind={
            hasActiveFilters ? "filtered" : canCreate ? "empty" : "read-only"
          }
          title={
            hasActiveFilters
              ? "Ingen resultater med de valgte filtre"
              : "Perioden er tom"
          }
        />
      ) : (
        <div
          className={`grid gap-4 ${view === "year" ? "md:grid-cols-3 xl:grid-cols-4" : view === "quarter" ? "md:grid-cols-3" : "grid-cols-1"}`}
        >
          {visibleMonths.map((month) => {
            const monthItems = getMonthItems(items, month);
            const { meetings, activities, otherItems } =
              splitMonthItems(monthItems);
            return (
              <section
                className="entity-record min-h-44 px-3 py-4 sm:px-4"
                key={month}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    className="min-w-0 text-left hover:text-brand"
                    onClick={() => setSelectedMonth(month)}
                    type="button"
                  >
                    <h2 className="font-semibold">
                      {monthNames[month]} {data.year}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted">
                      {monthItems.length
                        ? `${monthItems.length} elementer`
                        : "Ingen planlagte aktiviteter"}
                    </p>
                  </button>
                  <Button
                    onClick={() => setSelectedMonth(month)}
                    size="sm"
                    variant="secondary"
                  >
                    Vis måned
                  </Button>
                </div>
                {monthItems.length ? (
                  renderMonthList(meetings, [...activities, ...otherItems])
                ) : (
                  <p className="mt-3 text-sm text-muted">
                    Ingen planlagte aktiviteter.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      <section className="border-t border-line pt-6">
        <h2 className="section-title">Deadline-overblik</h2>
        <p className="mt-1 text-sm text-muted">
          Aktiviteter, opgaver og beslutninger i ét overblik.
        </p>
        {deadlines.length ? (
          <div className="mt-4 divide-y divide-line">
            {deadlines.map((item) => {
              const taskStatus =
                item.kind === "task" && "status" in item ? item.status : null;
              const closedTask =
                item.kind === "task" &&
                (taskStatus === "completed" || taskStatus === "cancelled");
              const state =
                closedTask ||
                (item.event &&
                  ["completed", "cancelled"].includes(item.event.status))
                  ? null
                  : annualWheelDeadlineState(item.date, item.priority);
              return (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  key={`deadline-${item.id}`}
                >
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted">
                      {formatDate(item.date)}
                    </p>
                  </div>
                  <StatusBadge
                    tone={
                      taskStatus === "completed"
                        ? "success"
                        : taskStatus === "cancelled"
                          ? "neutral"
                          : state === "overdue"
                            ? "danger"
                            : state === "critical"
                              ? "warning"
                              : "neutral"
                    }
                  >
                    {taskStatus === "completed"
                      ? "Gennemført"
                      : taskStatus === "cancelled"
                        ? "Annulleret"
                        : state === "overdue"
                          ? "Forsinket"
                          : state === "critical"
                            ? "Kritisk deadline"
                            : state === "upcoming"
                              ? "Kommende"
                              : "Planlagt"}
                  </StatusBadge>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Der er ingen deadlines i den valgte periode." />
        )}
      </section>

      {!draft ? <MutationFeedback feedback={mutation.feedback} /> : null}
      <EventModal
        data={data}
        draft={draft}
        canEdit={draftEvent ? eventCanEdit(draftEvent) : canCreate}
        error={error}
        fieldErrors={fieldErrors}
        notice={notice}
        feedback={mutation.feedback}
        onClose={closeDraft}
        onActivate={(eventId) => void activateTasks(eventId)}
        onDraft={setDraft}
        onRemove={() => void remove()}
        onSubmit={submit}
        organizationId={organizationId}
        activating={activating}
        currentEvent={draftEvent}
        activationYear={data.year}
        responsibleOptions={responsibleOptions}
        saving={saving || mutation.pending}
      />
      <Modal
        description="Møder og aktiviteter står øverst. Opgaver og deadlines kan foldes ud efter behov."
        maxWidth="3xl"
        onClose={() => setSelectedMonth(null)}
        open={selectedMonth !== null}
        title={
          selectedMonth !== null
            ? `${monthNames[selectedMonth]} ${data.year}`
            : "Måned"
        }
      >
        {selectedMonth !== null && selectedMonthItems.length ? (
          <div className="space-y-5">
            <section>
              <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                <h3 className="text-sm font-semibold">Møder</h3>
                <span className="text-xs text-muted">
                  {selectedMonthGroups.meetings.length} møder
                </span>
              </div>
              {selectedMonthGroups.meetings.length ? (
                renderMonthList(selectedMonthGroups.meetings, [], "detail")
              ) : (
                <p className="mt-3 text-sm text-muted">
                  Der er ingen møder i denne måned.
                </p>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                <h3 className="text-sm font-semibold">Aktiviteter</h3>
                <span className="text-xs text-muted">
                  {selectedMonthGroups.activities.length} aktiviteter
                </span>
              </div>
              {selectedMonthGroups.activities.length ? (
                renderMonthList([], selectedMonthGroups.activities, "detail")
              ) : (
                <p className="mt-3 text-sm text-muted">
                  Der er ingen årshjulsaktiviteter i denne måned.
                </p>
              )}
            </section>

            <details className="border-t border-line pt-3">
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-ink">
                <span>
                  Opgaver og deadlines ({selectedMonthGroups.otherItems.length})
                </span>
                <span className="text-xs font-normal text-muted">Fold ud</span>
              </summary>
              {selectedMonthGroups.otherItems.length ? (
                renderMonthList([], selectedMonthGroups.otherItems, "detail")
              ) : (
                <p className="mt-3 text-sm text-muted">
                  Der er ingen opgaver eller deadlines i denne måned.
                </p>
              )}
            </details>
          </div>
        ) : (
          <EmptyState title="Ingen planlagte aktiviteter i denne måned." />
        )}
      </Modal>
    </div>
  );
}

function EventModal({
  activating,
  activationYear,
  canEdit,
  currentEvent,
  data,
  draft,
  error,
  feedback,
  fieldErrors,
  notice,
  onActivate,
  onClose,
  onDraft,
  onRemove,
  onSubmit,
  organizationId,
  responsibleOptions,
  saving,
}: {
  activating: boolean;
  activationYear: number;
  canEdit: boolean;
  currentEvent: AnnualWheelEventView | null;
  data: AnnualWheelOverview;
  draft: EventDraft | null;
  error: string | null;
  feedback: MutationFeedbackState;
  fieldErrors: Record<string, string>;
  notice: string | null;
  onActivate: (eventId: string) => void;
  onClose: () => void;
  onDraft: (draft: EventDraft) => void;
  onRemove: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  organizationId: string;
  responsibleOptions: AnnualWheelOverview["members"];
  saving: boolean;
}) {
  const [isEditing, setIsEditing] = useState(!draft?.id);

  useEffect(() => {
    setIsEditing(!draft?.id);
  }, [draft?.id]);

  function cancelEditing() {
    if (currentEvent) {
      onDraft(draftFromEvent(currentEvent));
      setIsEditing(false);
      return;
    }

    onClose();
  }

  return (
    <Modal
      description={
        draft?.id && !isEditing
          ? "Overblik over aktivitetens plan, personer og opgaver."
          : undefined
      }
      maxWidth="6xl"
      onClose={onClose}
      open={Boolean(draft)}
      title={
        draft?.id
          ? isEditing
            ? "Rediger aktivitet"
            : draft.title
          : "Opret aktivitet"
      }
    >
      {draft?.id && currentEvent && !isEditing ? (
        <AnnualWheelEventReadView
          activating={activating}
          activationYear={activationYear}
          canEdit={canEdit}
          currentEvent={currentEvent}
          data={data}
          error={error}
          notice={notice}
          onActivate={onActivate}
          onEdit={() => setIsEditing(true)}
          organizationId={organizationId}
        />
      ) : draft ? (
        <form className="space-y-4" noValidate onSubmit={onSubmit}>
          <MutationFeedback feedback={feedback} />
          {error ? (
            <div className="alert-danger p-3 text-sm">{error}</div>
          ) : null}
          {notice ? (
            <div className="rounded-[var(--radius-control)] bg-success/10 p-3 text-sm text-success">
              {notice}
            </div>
          ) : null}
          {currentEvent && eventIsOverdue(currentEvent) ? (
            <div className="rounded-[var(--radius-control)] bg-warning/10 p-3 text-sm text-warning">
              Aktiviteten er forsinket. Markér den som gennemført eller
              annulleret, når den ikke længere skal vises som forsinket.
            </div>
          ) : null}
          <Field
            error={fieldErrors.title}
            errorId="annual-wheel-title-error"
            label="Titel"
          >
            <Input
              aria-describedby={
                fieldErrors.title ? "annual-wheel-title-error" : undefined
              }
              aria-invalid={Boolean(fieldErrors.title)}
              id="annual-wheel-title"
              onChange={(event) =>
                onDraft({ ...draft, title: event.target.value })
              }
              value={draft.title}
            />
          </Field>
          <Field
            error={fieldErrors.description}
            errorId="annual-wheel-description-error"
            label="Beskrivelse"
          >
            <Textarea
              aria-describedby={
                fieldErrors.description
                  ? "annual-wheel-description-error"
                  : undefined
              }
              aria-invalid={Boolean(fieldErrors.description)}
              id="annual-wheel-description"
              onChange={(event) =>
                onDraft({ ...draft, description: event.target.value })
              }
              value={draft.description}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              error={fieldErrors.startsOn}
              errorId="annual-wheel-startsOn-error"
              label="Startdato"
            >
              <Input
                aria-describedby={
                  fieldErrors.startsOn
                    ? "annual-wheel-startsOn-error"
                    : undefined
                }
                aria-invalid={Boolean(fieldErrors.startsOn)}
                id="annual-wheel-startsOn"
                onChange={(event) =>
                  onDraft({ ...draft, startsOn: event.target.value })
                }
                type="date"
                value={draft.startsOn}
              />
            </Field>
            <Field
              error={fieldErrors.endsOn}
              errorId="annual-wheel-endsOn-error"
              label="Slutdato"
            >
              <Input
                aria-describedby={
                  fieldErrors.endsOn ? "annual-wheel-endsOn-error" : undefined
                }
                aria-invalid={Boolean(fieldErrors.endsOn)}
                id="annual-wheel-endsOn"
                onChange={(event) =>
                  onDraft({ ...draft, endsOn: event.target.value })
                }
                type="date"
                value={draft.endsOn}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Relateret udvalg">
              <Select
                id="annual-wheel-committeeId"
                onChange={(event) =>
                  onDraft({
                    ...draft,
                    committeeId: event.target.value,
                    responsibleUserId: "",
                  })
                }
                value={draft.committeeId}
              >
                {data.canEditOrganization ? (
                  <option value="">Hele organisationen</option>
                ) : null}
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
            </Field>
            <Field label="Ansvarlig">
              <Select
                id="annual-wheel-responsibleUserId"
                onChange={(event) =>
                  onDraft({ ...draft, responsibleUserId: event.target.value })
                }
                value={draft.responsibleUserId}
              >
                <option value="">Ingen ansvarlig</option>
                {responsibleOptions.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.full_name || member.email}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status">
              <Select
                onChange={(event) =>
                  onDraft({
                    ...draft,
                    status: event.target
                      .value as AnnualWheelEventView["status"],
                  })
                }
                value={draft.status}
              >
                {Object.entries(eventStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Kategori">
              <Input
                onChange={(event) =>
                  onDraft({ ...draft, category: event.target.value })
                }
                value={draft.category}
              />
            </Field>
            <Field label="Prioritet">
              <Select
                onChange={(event) =>
                  onDraft({
                    ...draft,
                    priority: event.target.value as AnnualWheelPriority,
                  })
                }
                value={draft.priority}
              >
                {Object.entries(annualWheelPriorityLabels).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gentagelse">
              <Select
                onChange={(event) =>
                  onDraft({
                    ...draft,
                    recurrence: event.target.value as AnnualWheelRecurrence,
                  })
                }
                value={draft.recurrence}
              >
                {Object.entries(annualWheelRecurrenceLabels).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </Select>
            </Field>
            {draft.recurrence === "custom" ? (
              <Field label="Interval i måneder">
                <Input
                  min={1}
                  onChange={(event) =>
                    onDraft({
                      ...draft,
                      recurrenceInterval: Number(event.target.value),
                    })
                  }
                  type="number"
                  value={draft.recurrenceInterval}
                />
              </Field>
            ) : null}
          </div>
          {draft.id && draft.recurrence !== "none" ? (
            <p className="text-xs text-muted">
              Ændringen gælder kun den valgte forekomst. Historiske forekomster
              bevares.
            </p>
          ) : null}
          <AnnualWheelKeyPeopleEditor
            draft={draft}
            members={data.members}
            onDraft={onDraft}
          />
          <AnnualWheelTaskTemplateEditor
            draft={draft}
            onDraft={onDraft}
            responsibleOptions={responsibleOptions}
          />
          {draft.id ? (
            <AnnualWheelActivatedTasks
              activating={activating}
              activationYear={activationYear}
              canActivate={canEdit}
              currentEvent={currentEvent}
              onActivate={onActivate}
              organizationId={organizationId}
            />
          ) : (
            <p className="border-t border-line pt-4 text-sm text-muted">
              Gem aktiviteten først, før faste opgaver kan aktiveres som
              almindelige tasks.
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-3 pt-2">
            <div>
              {draft.id ? (
                <Button
                  disabled={saving}
                  onClick={onRemove}
                  type="button"
                  variant="danger"
                >
                  Fjern forekomst
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button onClick={cancelEditing} type="button" variant="secondary">
                Annuller
              </Button>
              <Button disabled={saving} type="submit">
                {saving ? "Gemmer..." : "Gem aktivitet"}
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}

function AnnualWheelEventReadView({
  activating,
  activationYear,
  canEdit,
  currentEvent,
  data,
  error,
  notice,
  onActivate,
  onEdit,
  organizationId,
}: {
  activating: boolean;
  activationYear: number;
  canEdit: boolean;
  currentEvent: AnnualWheelEventView;
  data: AnnualWheelOverview;
  error: string | null;
  notice: string | null;
  onActivate: (eventId: string) => void;
  onEdit: () => void;
  organizationId: string;
}) {
  const responsibleName =
    currentEvent.responsible?.full_name ||
    data.members.find(
      (member) => member.user_id === currentEvent.responsible_user_id,
    )?.full_name ||
    "Ingen ansvarlig";
  const activatedTasks = currentEvent.activatedTasks.filter(
    (task) => task.annual_wheel_activation_year === activationYear,
  );

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            tone={
              currentEvent.status === "completed"
                ? "success"
                : currentEvent.status === "cancelled"
                  ? "neutral"
                  : eventIsOverdue(currentEvent)
                    ? "warning"
                    : "info"
            }
          >
            {eventStatusLabels[currentEvent.status]}
          </StatusBadge>
          {eventIsOverdue(currentEvent) ? (
            <StatusBadge tone="warning">Forsinket</StatusBadge>
          ) : null}
          <span className="text-sm text-muted">
            {formatDate(currentEvent.starts_on)}
            {currentEvent.ends_on !== currentEvent.starts_on
              ? ` – ${formatDate(currentEvent.ends_on)}`
              : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className={buttonClassName({
              size: "sm",
              variant: "secondary",
            })}
            href={`/api/annual-wheel/${currentEvent.id}/pdf?organizationId=${organizationId}`}
          >
            Download som PDF
          </Link>
          {canEdit ? (
            <Button onClick={onEdit} type="button">
              Rediger aktivitet
            </Button>
          ) : (
            <StatusBadge tone="neutral">Skrivebeskyttet</StatusBadge>
          )}
        </div>
      </div>

      {notice ? (
        <div className="rounded-[var(--radius-control)] bg-success/10 p-3 text-sm text-success">
          {notice}
        </div>
      ) : null}
      {error ? <div className="alert-danger p-3 text-sm">{error}</div> : null}

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
        <div className="space-y-7">
          <section>
            <h3 className="text-sm font-semibold">Om aktiviteten</h3>
            <div className="mt-3 grid gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-2">
              <ReadValue
                label="Periode"
                value={`${formatDate(currentEvent.starts_on)}${
                  currentEvent.ends_on !== currentEvent.starts_on
                    ? ` – ${formatDate(currentEvent.ends_on)}`
                    : ""
                }`}
              />
              <ReadValue
                label="Udvalg"
                value={currentEvent.committee?.name ?? "Hele organisationen"}
              />
              <ReadValue label="Ansvarlig" value={responsibleName} />
              <ReadValue
                label="Kategori"
                value={currentEvent.category || "Ingen kategori"}
              />
              <ReadValue
                label="Prioritet"
                value={annualWheelPriorityLabels[currentEvent.priority]}
              />
              <ReadValue
                label="Gentagelse"
                value={
                  annualWheelRecurrenceLabels[currentEvent.recurrence] ??
                  "Ingen gentagelse"
                }
              />
            </div>
            {currentEvent.description ? (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                  Beskrivelse
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">
                  {currentEvent.description}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">
                Der er ikke tilføjet en beskrivelse.
              </p>
            )}
          </section>

          <section className="border-t border-line pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">
                  Ansvarlige og nøglepersoner
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Praktiske kontaktpersoner knyttet til aktiviteten.
                </p>
              </div>
              <span className="text-xs text-muted">
                {currentEvent.keyPeople.length} personer
              </span>
            </div>
            {currentEvent.keyPeople.length ? (
              <div className="mt-3 overflow-hidden border-y border-line">
                <div className="hidden grid-cols-[1.1fr_1fr_0.8fr_1fr] gap-3 bg-subtle/45 px-3 py-2 text-xs font-semibold text-muted md:grid">
                  <span>Navn</span>
                  <span>Funktion</span>
                  <span>Telefon</span>
                  <span>E-mail</span>
                </div>
                {currentEvent.keyPeople.map((person) => (
                  <div
                    className="grid gap-2 border-t border-line px-3 py-3 first:border-t-0 md:grid-cols-[1.1fr_1fr_0.8fr_1fr]"
                    key={person.id}
                  >
                    <ReadListCell label="Navn" value={person.name} />
                    <ReadListCell label="Funktion" value={person.role_title} />
                    <ReadListCell label="Telefon" value={person.phone || "—"} />
                    <ReadListCell label="E-mail" value={person.email || "—"} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">
                Ingen nøglepersoner er tilføjet.
              </p>
            )}
          </section>
        </div>

        <div className="space-y-7">
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Faste opgaver</h3>
                <p className="mt-1 text-sm text-muted">
                  Skabeloner, der kan aktiveres som almindelige tasks.
                </p>
              </div>
              <span className="text-xs text-muted">
                {currentEvent.taskTemplates.length} opgaver
              </span>
            </div>
            {currentEvent.taskTemplates.length ? (
              <div className="mt-3 divide-y divide-line border-y border-line">
                {currentEvent.taskTemplates.map((template) => {
                  const suggestedResponsible = data.members.find(
                    (member) =>
                      member.user_id === template.suggested_responsible_user_id,
                  );
                  return (
                    <div className="py-3" key={template.id}>
                      <p className="text-sm font-medium">{template.title}</p>
                      {template.description ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-muted">
                          {template.description}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-muted">
                        {suggestedResponsible?.full_name
                          ? `Foreslået ansvarlig: ${suggestedResponsible.full_name}`
                          : "Ingen foreslået ansvarlig"}
                        {template.deadline_offset_days !== null
                          ? ` · Deadline ${annualWheelTaskDeadlineLabel(
                              {
                                deadlineAnchor: template.deadline_anchor,
                                deadlineOffsetDays:
                                  template.deadline_offset_days,
                              },
                              {
                                startsOn: currentEvent.starts_on,
                                endsOn: currentEvent.ends_on,
                              },
                            )}`
                          : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">
                Ingen faste opgaver er tilføjet.
              </p>
            )}
          </section>

          <AnnualWheelActivatedTasks
            activating={activating}
            activationYear={activationYear}
            canActivate={canEdit}
            currentEvent={currentEvent}
            onActivate={onActivate}
            organizationId={organizationId}
          />

          {activatedTasks.length > 0 ? (
            <p className="text-xs text-muted">
              {activatedTasks.length} task
              {activatedTasks.length === 1 ? "" : "s"} er aktiveret for{" "}
              {activationYear}.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReadValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function ReadListCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-xs font-semibold text-muted md:hidden">
        {label}:{" "}
      </span>
      <span className="break-words text-sm">{value}</span>
    </div>
  );
}

function AnnualWheelKeyPeopleEditor({
  draft,
  members,
  onDraft,
}: {
  draft: EventDraft;
  members: AnnualWheelOverview["members"];
  onDraft: (draft: EventDraft) => void;
}) {
  const activeMembers = members.filter((member) => member.status === "active");

  function updatePerson(index: number, patch: Partial<KeyPersonDraft>) {
    onDraft({
      ...draft,
      keyPeople: draft.keyPeople.map((person, currentIndex) =>
        currentIndex === index ? { ...person, ...patch } : person,
      ),
    });
  }

  function selectMember(index: number, userId: string) {
    const member = activeMembers.find((item) => item.user_id === userId);
    updatePerson(index, {
      userId,
      name: member ? member.full_name || member.email : "",
      email: member?.email ?? "",
    });
  }

  return (
    <section className="border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Ansvarlige og nøglepersoner</h3>
          <p className="mt-1 text-sm text-muted">
            Gem praktiske kontaktpersoner til aktiviteten, fx kasserer,
            bogholder eller revisor.
          </p>
        </div>
        <Button
          onClick={() =>
            onDraft({
              ...draft,
              keyPeople: [
                ...draft.keyPeople,
                {
                  userId: "",
                  name: "",
                  roleTitle: "",
                  phone: "",
                  email: "",
                },
              ],
            })
          }
          size="sm"
          type="button"
          variant="secondary"
        >
          Tilføj nøgleperson
        </Button>
      </div>

      {draft.keyPeople.length ? (
        <div className="mt-3 space-y-3">
          <div className="hidden grid-cols-[1.15fr_1fr_0.85fr_1fr_auto] gap-2 px-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted md:grid">
            <span>Navn</span>
            <span>Funktion</span>
            <span>Telefon</span>
            <span>E-mail</span>
            <span />
          </div>
          {draft.keyPeople.map((person, index) => (
            <div
              className="grid gap-2 border border-line bg-surface p-3 md:grid-cols-[1.15fr_1fr_0.85fr_1fr_auto] md:items-end"
              key={person.id ?? index}
            >
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-muted md:hidden">
                  Navn
                </label>
                <Select
                  onChange={(event) => selectMember(index, event.target.value)}
                  value={person.userId}
                >
                  <option value="">Manuel/ekstern nøgleperson</option>
                  {activeMembers.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name || member.email}
                    </option>
                  ))}
                </Select>
                <Input
                  onChange={(event) =>
                    updatePerson(index, { name: event.target.value })
                  }
                  placeholder="Navn"
                  value={person.name}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted md:hidden">
                  Funktion
                </label>
                <Input
                  onChange={(event) =>
                    updatePerson(index, { roleTitle: event.target.value })
                  }
                  placeholder="fx Kasserer"
                  value={person.roleTitle}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted md:hidden">
                  Telefon
                </label>
                <Input
                  onChange={(event) =>
                    updatePerson(index, { phone: event.target.value })
                  }
                  placeholder="—"
                  value={person.phone}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted md:hidden">
                  E-mail
                </label>
                <Input
                  onChange={(event) =>
                    updatePerson(index, { email: event.target.value })
                  }
                  placeholder="—"
                  type="email"
                  value={person.email}
                />
              </div>
              <Button
                onClick={() =>
                  onDraft({
                    ...draft,
                    keyPeople: draft.keyPeople.filter(
                      (_, currentIndex) => currentIndex !== index,
                    ),
                  })
                }
                type="button"
                variant="ghost"
              >
                Fjern
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Ingen nøglepersoner tilføjet endnu.
        </p>
      )}
    </section>
  );
}

function AnnualWheelTaskTemplateEditor({
  draft,
  onDraft,
  responsibleOptions,
}: {
  draft: EventDraft;
  onDraft: (draft: EventDraft) => void;
  responsibleOptions: AnnualWheelOverview["members"];
}) {
  const [newTemplateFocusId, setNewTemplateFocusId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!newTemplateFocusId) return;
    const element = document.getElementById(
      `annual-wheel-task-template-title-${newTemplateFocusId}`,
    );
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.focus();
    setNewTemplateFocusId(null);
  }, [draft.taskTemplates, newTemplateFocusId]);

  function updateTemplate(index: number, patch: Partial<TaskTemplateDraft>) {
    onDraft({
      ...draft,
      taskTemplates: draft.taskTemplates.map((template, currentIndex) =>
        currentIndex === index ? { ...template, ...patch } : template,
      ),
    });
  }

  function addTemplate() {
    const id = crypto.randomUUID();
    setNewTemplateFocusId(id);
    onDraft({
      ...draft,
      taskTemplates: [
        {
          id,
          title: "",
          description: "",
          suggestedResponsibleUserId: draft.responsibleUserId,
          deadlineAnchor: "start",
          deadlineOffsetDays: null,
        },
        ...draft.taskTemplates,
      ],
    });
  }

  return (
    <section className="border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Faste opgaver</h3>
          <p className="mt-1 text-sm text-muted">
            Skabeloner under aktiviteten. De bliver først til tasks, når de
            aktiveres for et år.
          </p>
        </div>
        <Button
          onClick={addTemplate}
          size="sm"
          type="button"
          variant="secondary"
        >
          Tilføj fast opgave
        </Button>
      </div>
      {draft.taskTemplates.length ? (
        <div className="mt-3 space-y-3">
          {draft.taskTemplates.map((template, index) => {
            const deadlineAbsDays =
              template.deadlineOffsetDays === null
                ? ""
                : String(Math.abs(template.deadlineOffsetDays));
            const deadlineDirection =
              template.deadlineOffsetDays === null
                ? "before"
                : template.deadlineOffsetDays < 0
                  ? "before"
                  : "after";
            return (
              <div
                className="border border-line bg-subtle/30 p-3"
                key={template.id ?? index}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Titel">
                    <Input
                      id={`annual-wheel-task-template-title-${template.id ?? index}`}
                      onChange={(event) =>
                        updateTemplate(index, { title: event.target.value })
                      }
                      value={template.title}
                    />
                  </Field>
                  <Field label="Foreslået ansvarlig">
                    <Select
                      onChange={(event) =>
                        updateTemplate(index, {
                          suggestedResponsibleUserId: event.target.value,
                        })
                      }
                      value={template.suggestedResponsibleUserId}
                    >
                      <option value="">Brug aktivitetens ansvarlige</option>
                      {responsibleOptions.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.full_name || member.email}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Beskrivelse">
                  <Textarea
                    onChange={(event) =>
                      updateTemplate(index, { description: event.target.value })
                    }
                    value={template.description}
                  />
                </Field>
                <div className="mt-3 grid gap-3 sm:grid-cols-[0.75fr_0.9fr_1fr_auto]">
                  <Field label="Deadline fra">
                    <Select
                      onChange={(event) =>
                        updateTemplate(index, {
                          deadlineAnchor: event.target.value as "start" | "end",
                        })
                      }
                      value={template.deadlineAnchor}
                    >
                      <option value="start">Aktivitetens start</option>
                      <option value="end">Aktivitetens slutning</option>
                    </Select>
                  </Field>
                  <Field label="Retning">
                    <Select
                      onChange={(event) => {
                        const currentDays = Math.abs(
                          template.deadlineOffsetDays ?? 0,
                        );
                        updateTemplate(index, {
                          deadlineOffsetDays:
                            event.target.value === "before"
                              ? -currentDays
                              : currentDays,
                        });
                      }}
                      value={deadlineDirection}
                    >
                      <option value="before">Før</option>
                      <option value="after">Efter</option>
                    </Select>
                  </Field>
                  <Field label="Antal dage">
                    <Input
                      onChange={(event) =>
                        updateTemplate(index, {
                          deadlineOffsetDays: event.target.value
                            ? (deadlineDirection === "before" ? -1 : 1) *
                              Math.abs(Number(event.target.value))
                            : null,
                        })
                      }
                      min={0}
                      placeholder="fx 14"
                      type="number"
                      value={deadlineAbsDays}
                    />
                    <p className="mt-1 text-xs text-muted">
                      {annualWheelTaskDeadlineLabel(template, draft)}
                    </p>
                  </Field>
                  <div className="flex items-end">
                    <Button
                      onClick={() =>
                        onDraft({
                          ...draft,
                          taskTemplates: draft.taskTemplates.filter(
                            (_, currentIndex) => currentIndex !== index,
                          ),
                        })
                      }
                      type="button"
                      variant="ghost"
                    >
                      Fjern
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Ingen faste opgaver endnu.</p>
      )}
    </section>
  );
}

function AnnualWheelActivatedTasks({
  activating,
  activationYear,
  canActivate,
  currentEvent,
  onActivate,
  organizationId,
}: {
  activating: boolean;
  activationYear: number;
  canActivate: boolean;
  currentEvent: AnnualWheelEventView | null;
  onActivate: (eventId: string) => void;
  organizationId: string;
}) {
  const activatedTasks =
    currentEvent?.activatedTasks.filter(
      (task) => task.annual_wheel_activation_year === activationYear,
    ) ?? [];

  return (
    <section className="border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            Aktiverede opgaver for {activationYear}
          </h3>
          <p className="mt-1 text-sm text-muted">
            Oprettes som almindelige tasks og vises i Task Board og Mine
            opgaver.
          </p>
        </div>
        {currentEvent && canActivate ? (
          <Button
            disabled={activating || currentEvent.taskTemplates.length === 0}
            onClick={() => onActivate(currentEvent.id)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {activating
              ? "Aktiverer..."
              : `Aktivér opgaver for ${activationYear}`}
          </Button>
        ) : null}
      </div>
      {activatedTasks.length ? (
        <div className="mt-3 space-y-2">
          {activatedTasks.map((task) => (
            <Link
              className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-3 py-2 text-sm hover:bg-subtle"
              href={`/organizations/${organizationId}/tasks?editTask=${task.id}#task-${task.id}`}
              key={task.id}
            >
              <span className="font-medium">{task.title}</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {task.deadline ? formatDate(task.deadline) : "Ingen deadline"}
                <StatusBadge
                  tone={task.status === "completed" ? "success" : "neutral"}
                >
                  {task.status === "completed" ? "Gennemført" : "Aktiv"}
                </StatusBadge>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Ingen tasks er aktiveret for {activationYear} endnu.
        </p>
      )}
    </section>
  );
}

function Field({
  children,
  error,
  errorId,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  errorId?: string;
  label: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
      {error ? (
        <span className="block text-xs text-danger" id={errorId}>
          {error}
        </span>
      ) : null}
    </label>
  );
}
