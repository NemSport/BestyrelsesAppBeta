"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  useMutationFeedback,
  useUnsavedChanges,
} from "@/hooks/use-mutation-feedback";
import {
  activeFollowUpTasks,
  beforeTaskFollowUpReviewEvent,
  followUpReasons,
  type FollowUpTask,
  type FollowUpState,
} from "@/lib/meeting-task-follow-up";
import { formatDate, formatDateTime } from "@/lib/localization";

const statuses = {
  not_started: "Ikke startet",
  in_progress: "I gang",
  waiting: "Afventer",
  completed: "Afsluttet",
  cancelled: "Annulleret",
};
type State = FollowUpState & { canEdit: boolean; canLink: boolean };
type Scope = { organizationId: string; committeeId: string; meetingId: string };
async function responseBody(response: Response) {
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Handlingen mislykkedes. Prøv igen.");
  return body;
}

export function EnableMeetingTaskFollowUp(scope: Scope) {
  const router = useRouter();
  const feedback = useMutationFeedback();
  return (
    <div className="my-3">
      <Button
        variant="secondary"
        disabled={feedback.pending}
        onClick={async () => {
          if (!feedback.begin()) return;
          try {
            await responseBody(
              await fetch(`/api/meetings/${scope.meetingId}/task-follow-up`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(scope),
              }),
            );
            feedback.succeed("Systempunktet er tilføjet.");
            router.refresh();
          } catch (error) {
            feedback.fail((error as Error).message);
          }
        }}
      >
        Tilføj Opgaver &amp; opfølgning
      </Button>
      <p role="status" className="text-sm">
        {feedback.feedback.message}
      </p>
    </div>
  );
}

export function MeetingTaskFollowUp({
  organizationId,
  committeeId,
  meetingId,
  active,
  occurrenceId,
}: Scope & { active: boolean; occurrenceId?: string }) {
  const router = useRouter();
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"attention" | "all">("attention");
  const [editing, setEditing] = useState<FollowUpTask | null>(null);
  const feedback = useMutationFeedback();
  const sequence = useRef(0);
  const retry = useRef<{ signature: string; requestId: string } | null>(null);
  const endpoint = `/api/meetings/${meetingId}/task-follow-up`;
  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const body = await responseBody(
        await fetch(
          `${endpoint}?organizationId=${organizationId}&committeeId=${committeeId}`,
          { cache: "no-store" },
        ),
      );
      if (sequence.current === current) {
        setData(body);
        setError(null);
      }
    } catch (err) {
      if (sequence.current === current) setError((err as Error).message);
    }
  }, [endpoint, organizationId, committeeId]);
  const invalidatePendingRead = useCallback(() => {
    ++sequence.current;
  }, []);
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (!document.hidden) void load();
    };
    void load();
    const timer = window.setInterval(refresh, 20000);
    window.addEventListener("focus", refresh);
    return () => {
      invalidatePendingRead();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [active, load, invalidatePendingRead]);

  const mutate = async (
    task: FollowUpTask,
    change: Record<string, unknown>,
  ) => {
    if (!feedback.begin()) return false;
    const signature = JSON.stringify({
      taskId: task.id,
      expectedVersion: task.updated_at,
      ...change,
    });
    if (retry.current?.signature !== signature)
      retry.current = { signature, requestId: crypto.randomUUID() };
    try {
      await responseBody(
        await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            committeeId,
            taskId: task.id,
            expectedVersion: task.updated_at,
            requestId: retry.current.requestId,
            ...change,
          }),
        }),
      );
      retry.current = null;
      feedback.succeed("Gemt på opgaven og i mødehistorikken.");
      await load();
      router.refresh();
      return true;
    } catch (err) {
      feedback.fail((err as Error).message);
      return false;
    }
  };
  // The agenda hides inactive cards. Keep a dirty editor mounted across point changes.
  if (!active && !editing) return null;
  if (!data)
    return (
      <div className="p-4" role="status">
        {error ?? "Henter opgaver…"}
        <Button variant="ghost" onClick={load}>
          Prøv igen
        </Button>
      </div>
    );
  const linkedIds = new Set(
    data.links
      .filter((link) => link.occurrence_id === occurrenceId)
      .map((link) => link.task_id),
  );
  const tasks = occurrenceId
    ? data.tasks.filter((task) => linkedIds.has(task.id))
    : activeFollowUpTasks(data.tasks, tab === "attention");
  if (editing && !tasks.some((task) => task.id === editing.id))
    tasks.push(editing);
  const events = occurrenceId
    ? data.events.filter((event) => linkedIds.has(event.task_id))
    : data.events;
  if (occurrenceId && !tasks.length && !events.length) return null;
  const canEdit = data.canEdit && data.writable;
  return (
    <section
      className="space-y-3 border-b border-line bg-surface p-3 sm:p-5"
      aria-label="Opgaver og opfølgning"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          {occurrenceId ? "Tilknyttede opgaver" : "Opgaver & opfølgning"}
        </h3>
        <Button variant="ghost" size="sm" onClick={load}>
          Opdatér
        </Button>
      </div>
      <p className="text-xs text-muted">
        Aktuelle opgaver i udvalget · Snarlig: inden for 7 dage · Opdateres
        hvert 20. sekund
      </p>
      {!data.writable ? (
        <p className="text-sm">
          Mødet er afsluttet eller referatet godkendt. Opgaver vises kun til
          læsning.
        </p>
      ) : null}
      {!occurrenceId ? (
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Opgavefilter"
        >
          <Button
            role="tab"
            aria-selected={tab === "attention"}
            variant={tab === "attention" ? "primary" : "secondary"}
            onClick={() => setTab("attention")}
          >
            Kræver opfølgning ({activeFollowUpTasks(data.tasks, true).length})
          </Button>
          <Button
            role="tab"
            aria-selected={tab === "all"}
            variant={tab === "all" ? "primary" : "secondary"}
            onClick={() => setTab("all")}
          >
            Alle aktive ({activeFollowUpTasks(data.tasks, false).length})
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error} · Oversigten kan være forældet.
        </p>
      ) : null}
      <p
        role={feedback.feedback.status === "error" ? "alert" : "status"}
        className="text-sm"
      >
        {feedback.feedback.message}
      </p>
      {!tasks.length ? (
        <p className="text-sm text-muted">Ingen opgaver i denne visning.</p>
      ) : null}
      {tasks.map((task) => {
        const link = data.links.find((link) => link.task_id === task.id);
        return (
          <article
            key={task.id}
            className="space-y-2 rounded-lg border border-line p-3"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <h4 className="break-words font-semibold">{task.title}</h4>
              <span className="text-sm">{statuses[task.status]}</span>
            </div>
            <p className="text-sm">
              {task.responsible_name || "Ingen ansvarlig"} ·{" "}
              {task.deadline ? formatDate(task.deadline) : "Ingen deadline"}
            </p>
            <div className="flex flex-wrap gap-2">
              {followUpReasons(task).map((reason) => (
                <span
                  key={reason}
                  className="rounded bg-warning-soft px-2 py-1 text-xs font-semibold"
                >
                  {reason}
                </span>
              ))}
            </div>
            {task.latest_note ? (
              <p className="whitespace-pre-wrap break-words text-sm text-muted">
                {task.latest_note}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {canEdit ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(task)}
                    disabled={feedback.pending || Boolean(editing)}
                  >
                    Rediger / tilføj note
                  </Button>
                  {task.status !== "completed" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={feedback.pending || Boolean(editing)}
                      onClick={() =>
                        mutate(task, { action: "update", status: "completed" })
                      }
                    >
                      Afslut opgave
                    </Button>
                  ) : null}
                </>
              ) : null}
              {link ? (
                <a
                  className="self-center text-sm font-semibold text-brand"
                  href={`#agenda-point-${link.occurrence_id}`}
                >
                  Åbn dagsordenspunkt
                </a>
              ) : data.canLink && data.writable ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={feedback.pending || Boolean(editing)}
                    onClick={() => mutate(task, { action: "link" })}
                  >
                    Opret særskilt punkt
                  </Button>
                  {data.occurrences.length ? (
                    <label className="text-sm">
                      Tilknyt eksisterende punkt
                      <select
                        className="field mt-1"
                        value=""
                        disabled={feedback.pending || Boolean(editing)}
                        onChange={(event) => {
                          if (event.target.value)
                            void mutate(task, {
                              action: "link",
                              occurrenceId: event.target.value,
                            });
                        }}
                      >
                        <option value="">Vælg punkt…</option>
                        {data.occurrences.map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </>
              ) : null}
            </div>
            {editing?.id === task.id ? (
              <TaskEditor
                task={editing}
                people={data.people}
                pending={feedback.pending}
                onCancel={() => setEditing(null)}
                onSave={async (change) => {
                  if (await mutate(editing, { action: "update", ...change }))
                    setEditing(null);
                }}
              />
            ) : null}
          </article>
        );
      })}
      <details className="rounded-lg border border-line p-3">
        <summary className="cursor-pointer font-semibold">
          Behandlet på mødet / historik ({events.length})
        </summary>
        <p className="my-2 text-xs text-muted">
          Historikken fastholder ændringerne på dette møde. Beslutninger og det
          officielle referat skrives fortsat i punktets referat.
        </p>
        {events.map((event) => (
          <article key={event.id} className="border-t border-line py-2 text-sm">
            <p className="font-semibold">
              {event.after_state.title} ·{" "}
              {event.action === "link"
                ? "Tilknyttet dagsordenspunkt"
                : "Opdateret"}
            </p>
            <p className="text-xs text-muted">
              {formatDateTime(event.created_at)} ·{" "}
              {event.actor_name || "Medlem"}
            </p>
            {event.action === "update" ? (
              <p>
                {event.before_state
                  ? `${statuses[event.before_state.status]} → `
                  : ""}
                {statuses[event.after_state.status]} · Deadline:{" "}
                {event.before_state?.deadline ?? "Ingen"} →{" "}
                {event.after_state.deadline ?? "Ingen"} · Ansvarlig:{" "}
                {event.before_state?.responsible_name ?? "Ingen"} →{" "}
                {event.after_state.responsible_name ?? "Ingen"} · Kritisk:{" "}
                {event.after_state.is_critical ? "Ja" : "Nej"}
              </p>
            ) : null}
            {event.note ? (
              <p className="whitespace-pre-wrap break-words">{event.note}</p>
            ) : null}
          </article>
        ))}
      </details>
      {!occurrenceId ? (
        <details className="rounded-lg border border-line p-3">
          <summary className="cursor-pointer font-semibold">
            Opgaver i udsendt materiale ({data.snapshots.length})
          </summary>
          {data.snapshots.length === 0 ? (
            <p className="mt-2 text-sm">
              Ingen gemte opgaveøjebliksbilleder. Gemmes ved nye udsendelser med
              opgaveliste.
            </p>
          ) : null}
          {data.snapshots.map((snapshot) => (
            <details className="mt-2" key={snapshot.id}>
              <summary>
                {formatDateTime(snapshot.sent_at)} · {snapshot.delivery_status}{" "}
                · {snapshot.task_snapshot.length} opgaver
              </summary>
              {snapshot.task_snapshot.map((task) => (
                <p className="py-1 text-sm" key={task.id}>
                  {task.title} ·{" "}
                  {statuses[task.status as keyof typeof statuses] ??
                    task.status}{" "}
                  · {task.deadline ?? "Ingen deadline"} ·{" "}
                  {task.responsible_name || "Ingen ansvarlig"}
                </p>
              ))}
            </details>
          ))}
        </details>
      ) : null}
    </section>
  );
}

function TaskEditor({
  task,
  people,
  pending,
  onCancel,
  onSave,
}: {
  task: FollowUpTask;
  people: FollowUpState["people"];
  pending: boolean;
  onCancel: () => void;
  onSave: (change: Record<string, unknown>) => Promise<void>;
}) {
  const [status, setStatus] = useState(task.status);
  const [deadline, setDeadline] = useState(task.deadline ?? "");
  const [responsible, setResponsible] = useState(
    task.responsible_user_id ?? "",
  );
  const [critical, setCritical] = useState(task.is_critical);
  const [note, setNote] = useState("");
  const dirty =
    status !== task.status ||
    deadline !== (task.deadline ?? "") ||
    responsible !== (task.responsible_user_id ?? "") ||
    critical !== task.is_critical ||
    note !== "";
  useUnsavedChanges(dirty);
  useEffect(() => {
    const guardReview = (event: Event) => {
      if (
        pending ||
        (dirty &&
          !window.confirm(
            "Du har ugemte opgaveændringer. Fortsæt til referatvisning uden at gemme?",
          ))
      )
        event.preventDefault();
    };
    window.addEventListener(beforeTaskFollowUpReviewEvent, guardReview);
    return () =>
      window.removeEventListener(beforeTaskFollowUpReviewEvent, guardReview);
  }, [dirty, pending]);
  return (
    <form
      className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          status,
          deadline: deadline || null,
          responsibleUserId: responsible || null,
          isCritical: critical,
          note,
        });
      }}
    >
      <label className="text-sm">
        Status
        <select
          className="field mt-1"
          value={status}
          onChange={(e) => setStatus(e.target.value as FollowUpTask["status"])}
        >
          {Object.entries(statuses).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Deadline
        <input
          className="field mt-1"
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
      </label>
      <label className="text-sm">
        Ansvarlig
        <select
          className="field mt-1"
          value={responsible}
          onChange={(e) => setResponsible(e.target.value)}
        >
          <option value="">Ingen ansvarlig</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={critical}
          onChange={(e) => setCritical(e.target.checked)}
        />
        Kritisk opgave
      </label>
      <label className="text-sm sm:col-span-2">
        Fælles opfølgningsnote
        <textarea
          className="field mt-1"
          maxLength={5000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending || !dirty}>
          Gem ændringer
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (!dirty || window.confirm("Kassér dine ændringer?")) onCancel();
          }}
        >
          Annuller
        </Button>
      </div>
    </form>
  );
}
