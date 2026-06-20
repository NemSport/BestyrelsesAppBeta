"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  annualWheelDeadlineState,
  annualWheelPriorityLabels,
  annualWheelRecurrenceLabels,
  type AnnualWheelPriority,
  type AnnualWheelRecurrence,
} from "@/lib/annual-wheel";
import {
  Button,
  EmptyState,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import type {
  AnnualWheelCalendarItem,
  AnnualWheelEventView,
  AnnualWheelOverview,
} from "@/types/domain";

type ViewMode = "year" | "quarter" | "month";
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
  recurrence: AnnualWheelRecurrence;
  recurrenceInterval: number;
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
    otherItems: items.filter((item) => item.kind !== "meeting"),
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
    recurrence: "none",
    recurrenceInterval: 1,
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
    recurrence: event.recurrence,
    recurrenceInterval: event.recurrence_interval,
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
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
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("year");
  const [focusMonth, setFocusMonth] = useState(new Date().getMonth());
  const [committeeId, setCommitteeId] = useState(initialCommitteeId);
  const [responsibleId, setResponsibleId] = useState("");
  const [kind, setKind] = useState("");
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const canCreate =
    data.canEditOrganization || data.editableCommitteeIds.length > 0;
  const visibleMonths =
    view === "year"
      ? monthNames.map((_, index) => index)
      : view === "quarter"
        ? [0, 1, 2].map(
            (offset) => Math.floor(focusMonth / 3) * 3 + offset,
          )
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
        (item) =>
          !responsibleId || item.responsibleUserId === responsibleId,
      )
      .filter((item) => !kind || item.kind === kind)
      .sort((left, right) => left.date.localeCompare(right.date));
  }, [committeeId, data.calendarItems, data.events, kind, responsibleId]);

  const deadlines = items
    .filter((item) => item.kind !== "meeting")
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 12);

  const selectedMonthItems =
    selectedMonth === null ? [] : getMonthItems(items, selectedMonth);
  const selectedMonthGroups = splitMonthItems(selectedMonthItems);

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
    const state =
      item.kind === "meeting"
        ? null
        : annualWheelDeadlineState(item.date, item.priority);
    const content = (
      <>
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span className="mt-0.5 w-12 shrink-0 text-xs font-semibold text-muted">
            {variant === "detail" ? shortDate(item.date) : item.date.slice(8, 10)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {item.title}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              {item.kind === "meeting" ? (
                <StatusBadge tone="neutral">Møde</StatusBadge>
              ) : (
                <span>{kindLabels[item.kind]}</span>
              )}
              {item.kind === "activity" ? (
                <span>{annualWheelPriorityLabels[item.priority]}</span>
              ) : null}
              {state === "overdue" ? (
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
    const visibleMeetings = variant === "card" ? meetings.slice(0, 3) : meetings;
    const visibleOtherItems =
      variant === "card" ? otherItems.slice(0, Math.max(0, 5 - visibleMeetings.length)) : otherItems;
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
      (data.canEditOrganization ? "" : data.editableCommitteeIds[0] ?? "");
    setError(null);
    setFieldErrors({});
    setDraft(emptyDraft(defaultCommittee));
  }

  function openEdit(event: AnnualWheelEventView) {
    setError(null);
    setFieldErrors({});
    setDraft(draftFromEvent(event));
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
    setDraft({
      ...emptyDraft(
        committeeId ||
          initialCommitteeId ||
          (data.canEditOrganization
            ? ""
            : data.editableCommitteeIds[0] ?? ""),
      ),
      title: suggestion.title,
      description: suggestion.description,
      startsOn,
      endsOn: startsOn,
      category: suggestion.category,
      priority: suggestion.priority,
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    const response = await fetch(
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
          recurrence: draft.recurrence,
          recurrenceInterval: draft.recurrenceInterval,
        }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(payload.error ?? "Aktiviteten kunne ikke gemmes.");
      setFieldErrors(
        Object.fromEntries(
          Object.entries(payload.fieldErrors ?? {}).map(([key, value]) => [
            key,
            Array.isArray(value) ? value[0] : String(value),
          ]),
        ),
      );
      return;
    }
    setDraft(null);
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="button-secondary"
            href={`?year=${data.year - 1}${initialCommitteeId ? `&committeeId=${initialCommitteeId}` : ""}`}
          >
            ← {data.year - 1}
          </Link>
          {(["year", "quarter", "month"] as const).map((mode) => (
              <Button
                key={mode}
                onClick={() => setView(mode)}
                variant={view === mode ? "primary" : "secondary"}
              >
                {mode === "year"
                  ? "Årsvisning"
                  : mode === "quarter"
                    ? "Kvartalsvisning"
                    : "Månedsvisning"}
              </Button>
            ))}
          <Link
            className="button-secondary"
            href={`?year=${data.year + 1}${initialCommitteeId ? `&committeeId=${initialCommitteeId}` : ""}`}
          >
            {data.year + 1} →
          </Link>
        </div>
        {canCreate ? <Button onClick={openCreate}>Opret aktivitet</Button> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Select
          aria-label="Filtrér på udvalg"
          onChange={(event) => setCommitteeId(event.target.value)}
          value={committeeId}
        >
          <option value="">Alle udvalg og organisationen</option>
          {data.committees.map((committee) => (
            <option key={committee.id} value={committee.id}>
              {committee.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filtrér på ansvarlig"
          onChange={(event) => setResponsibleId(event.target.value)}
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
          onChange={(event) => setKind(event.target.value)}
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
          onChange={(event) => setFocusMonth(Number(event.target.value))}
          value={focusMonth}
        >
          {monthNames.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </Select>
      </div>

      <section className="overflow-hidden rounded-[var(--radius-panel)] border border-brand/20 bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-brand-soft px-4 py-4">
          <div>
            <p className="page-eyebrow">AI-planlægningsassistent</p>
            <h2 className="mt-1 font-semibold">
              Find mangler i årets plan
            </h2>
            <p className="mt-1 text-sm text-muted">
              AI foreslår aktiviteter og dagsordenspunkter. Intet oprettes
              uden din godkendelse.
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
                        Foreslået måned: {monthNames[suggestion.suggestedMonth - 1]}
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

      <div
        className={`grid gap-4 ${view === "year" ? "md:grid-cols-3 xl:grid-cols-4" : view === "quarter" ? "md:grid-cols-3" : "grid-cols-1"}`}
      >
        {visibleMonths.map((month) => {
          const monthItems = getMonthItems(items, month);
          const { meetings, otherItems } = splitMonthItems(monthItems);
          return (
            <section
              className="min-h-44 border-b border-line bg-surface px-3 py-4 sm:px-4"
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
                renderMonthList(meetings, otherItems)
              ) : (
                <p className="mt-3 text-sm text-muted">
                  Ingen planlagte aktiviteter.
                </p>
              )}
            </section>
          );
        })}
      </div>

      <section className="border-t border-line pt-6">
        <h2 className="section-title">Deadline-overblik</h2>
        <p className="mt-1 text-sm text-muted">
          Aktiviteter, opgaver og beslutninger i ét overblik.
        </p>
        {deadlines.length ? (
          <div className="mt-4 divide-y divide-line">
            {deadlines.map((item) => {
              const state = annualWheelDeadlineState(
                item.date,
                item.priority,
              );
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
                      state === "overdue"
                        ? "danger"
                        : state === "critical"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {state === "overdue"
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

      <EventModal
        data={data}
        draft={draft}
        error={error}
        fieldErrors={fieldErrors}
        onClose={() => setDraft(null)}
        onDraft={setDraft}
        onRemove={() => void remove()}
        onSubmit={submit}
        responsibleOptions={responsibleOptions}
        saving={saving}
      />
      <Modal
        description="Møder står øverst. Opgaver, beslutningsdeadlines og aktiviteter er samlet nedenunder."
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
                <h3 className="text-sm font-semibold">Opgaver og deadlines</h3>
                <span className="text-xs text-muted">
                  {selectedMonthGroups.otherItems.length} elementer
                </span>
              </div>
              {selectedMonthGroups.otherItems.length ? (
                renderMonthList([], selectedMonthGroups.otherItems, "detail")
              ) : (
                <p className="mt-3 text-sm text-muted">
                  Der er ingen opgaver, deadlines eller aktiviteter i denne
                  måned.
                </p>
              )}
            </section>
          </div>
        ) : (
          <EmptyState title="Ingen planlagte aktiviteter i denne måned." />
        )}
      </Modal>
    </div>
  );
}

function EventModal({
  data,
  draft,
  error,
  fieldErrors,
  onClose,
  onDraft,
  onRemove,
  onSubmit,
  responsibleOptions,
  saving,
}: {
  data: AnnualWheelOverview;
  draft: EventDraft | null;
  error: string | null;
  fieldErrors: Record<string, string>;
  onClose: () => void;
  onDraft: (draft: EventDraft) => void;
  onRemove: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  responsibleOptions: AnnualWheelOverview["members"];
  saving: boolean;
}) {
  return (
    <Modal
      onClose={onClose}
      open={Boolean(draft)}
      title={draft?.id ? "Rediger aktivitet" : "Opret aktivitet"}
    >
      {draft ? (
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? <div className="alert-danger p-3 text-sm">{error}</div> : null}
          <Field error={fieldErrors.title} label="Titel">
            <Input
              onChange={(event) =>
                onDraft({ ...draft, title: event.target.value })
              }
              value={draft.title}
            />
          </Field>
          <Field error={fieldErrors.description} label="Beskrivelse">
            <Textarea
              onChange={(event) =>
                onDraft({ ...draft, description: event.target.value })
              }
              value={draft.description}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field error={fieldErrors.startsOn} label="Startdato">
              <Input
                onChange={(event) =>
                  onDraft({ ...draft, startsOn: event.target.value })
                }
                type="date"
                value={draft.startsOn}
              />
            </Field>
            <Field error={fieldErrors.endsOn} label="Slutdato">
              <Input
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
              Ændringen gælder kun den valgte forekomst. Historiske
              forekomster bevares.
            </p>
          ) : null}
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
              <Button onClick={onClose} type="button" variant="secondary">
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

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
      {error ? <span className="block text-xs text-danger">{error}</span> : null}
    </label>
  );
}
