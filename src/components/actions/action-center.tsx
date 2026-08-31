"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  Button,
  EmptyState,
  StatusBadge,
  buttonClassName,
  staticSurfaceClassName,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/localization";
import type { ActionCenterData, ActionItem, TaskView } from "@/types/domain";

type ActionView = "inbox" | "mine" | "completed";

const priorityLabels = {
  critical: "Kritisk",
  soon: "Snart",
  follow_up: "Opfølgning",
  information: "Information",
} as const;

const priorityTones = {
  critical: "danger",
  soon: "warning",
  follow_up: "info",
  information: "neutral",
} as const;

function snoozeTime(choice: "later" | "tomorrow" | "three_days" | "next_week") {
  const value = new Date();
  if (choice === "later") {
    value.setHours(Math.max(value.getHours() + 3, 18), 0, 0, 0);
  } else if (choice === "tomorrow") {
    value.setDate(value.getDate() + 1);
    value.setHours(9, 0, 0, 0);
  } else if (choice === "three_days") {
    value.setDate(value.getDate() + 3);
    value.setHours(9, 0, 0, 0);
  } else {
    const daysUntilMonday = ((8 - value.getDay()) % 7) || 7;
    value.setDate(value.getDate() + daysUntilMonday);
    value.setHours(9, 0, 0, 0);
  }
  return value.toISOString();
}

function taskPayload(task: TaskView, overrides: Partial<{
  responsibleUserId: string | null;
  deadline: string | null;
}>) {
  return {
    organizationId: task.organization_id,
    committeeId: task.committee_id,
    meetingId: task.meeting_id,
    agendaItemId: task.agenda_item_id,
    decisionId: task.decision_id,
    title: task.title,
    description: task.description,
    status: task.status,
    responsibleUserId:
      overrides.responsibleUserId === undefined
        ? task.responsible_user_id
        : overrides.responsibleUserId,
    deadline: overrides.deadline === undefined ? task.deadline : overrides.deadline,
    reminderAt: task.reminder_at,
    category: task.category,
    internalNote: task.internal_note,
  };
}

export function ActionCenter({
  center,
  organizationId,
  view,
}: {
  center: ActionCenterData;
  organizationId: string;
  view: ActionView;
}) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customDates, setCustomDates] = useState<Record<string, string>>({});
  const actions = center[view];
  const root = `/organizations/${organizationId}`;

  const memberOptions = useMemo(
    () =>
      new Map(
        center.delegationMembers.map((member) => [member.user_id, member] as const),
      ),
    [center.delegationMembers],
  );

  async function request(
    url: string,
    body: Record<string, unknown>,
    method: "PATCH" | "POST" = "PATCH",
  ) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    if (!response.ok) throw new Error(result?.error || "Handlingen kunne ikke gemmes.");
  }

  function personalStatePayload(action: ActionItem, operation: "claim" | "snooze" | "dismiss") {
    return {
      actionKey: action.key,
      actionType: action.type,
      sourceType: action.sourceType,
      sourceId: action.sourceId,
      operation,
    };
  }

  async function updateState(
    action: ActionItem,
    operation: "claim" | "snooze" | "dismiss",
    extra: Record<string, unknown> = {},
  ) {
    setPendingKey(action.key);
    setError(null);
    try {
      await request(`/api/organizations/${organizationId}/actions`, {
        ...personalStatePayload(action, operation),
        ...extra,
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Handlingen kunne ikke gemmes.");
    } finally {
      setPendingKey(null);
    }
  }

  async function completeTask(action: ActionItem) {
    if (!action.task) return;
    setPendingKey(action.key);
    setError(null);
    try {
      await request(
        `/api/organizations/${organizationId}/actions`,
        personalStatePayload(action, "claim"),
      );
      await request(`/api/tasks/${action.task.id}`, {
        organizationId,
        action: "complete",
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Opgaven kunne ikke afsluttes.");
    } finally {
      setPendingKey(null);
    }
  }

  async function updateTask(
    action: ActionItem,
    overrides: Partial<{ responsibleUserId: string | null; deadline: string | null }>,
  ) {
    if (!action.task) return;
    setPendingKey(action.key);
    setError(null);
    try {
      await request(
        `/api/organizations/${organizationId}/actions`,
        personalStatePayload(action, "claim"),
      );
      await request(`/api/tasks/${action.task.id}`, taskPayload(action.task, overrides));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Opgaven kunne ikke opdateres.");
    } finally {
      setPendingKey(null);
    }
  }

  async function approveMinutes(action: ActionItem) {
    if (!action.meetingId || !action.committeeId) return;
    setPendingKey(action.key);
    setError(null);
    try {
      await request(
        `/api/organizations/${organizationId}/actions`,
        personalStatePayload(action, "claim"),
      );
      await request(
        `/api/meetings/${action.meetingId}/minutes/approval`,
        {
          organizationId,
          committeeId: action.committeeId,
          action: "respond",
          status: "approved",
          comment: null,
        },
        "POST",
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Referatet kunne ikke godkendes.");
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <nav aria-label="Handlingsvisning" className="flex flex-wrap gap-2 border-b border-line pb-3">
        {([
          ["inbox", "Min indbakke", center.inbox.length],
          ["mine", "Mine handlinger", center.mine.length],
          ["completed", "Afsluttet", center.completed.length],
        ] as const).map(([key, label, count]) => (
          <Link
            aria-current={view === key ? "page" : undefined}
            className={buttonClassName({
              className: "gap-1",
              size: "sm",
              variant: view === key ? "primary" : "secondary",
            })}
            href={`${root}/actions?view=${key}`}
            key={key}
          >
            {label} <span aria-label={`${count} handlinger`}>({count})</span>
          </Link>
        ))}
      </nav>

      {error ? (
        <p className="rounded-[var(--radius-control)] border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {actions.length ? (
        <div className="divide-y divide-line border-y border-line">
          {actions.map((action) => {
            const isPending = pendingKey === action.key;
            const canEditTask =
              action.task && center.editableCommitteeIds.includes(action.task.committee_id);
            const eligibleMembers = action.task
              ? center.delegationMembers.filter((member) =>
                  member.committees.some(
                    (committee) => committee.id === action.task?.committee_id,
                  ),
                )
              : [];
            return (
              <article className="py-4" data-action-key={action.key} key={action.key}>
                <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={priorityTones[action.priority]}>
                        {priorityLabels[action.priority]}
                      </StatusBadge>
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                        {action.category === "deadline"
                          ? "Deadline"
                          : action.category === "requires_action"
                            ? "Kræver din handling"
                            : "Opfølgning"}
                      </span>
                    </div>
                    <h2 className="mt-2 break-words text-base font-semibold text-ink">
                      {action.title}
                    </h2>
                    <p className="mt-1 text-sm leading-5 text-muted">{action.description}</p>
                    <p className="mt-1 text-xs text-muted">
                      {action.context}
                      {action.deadline ? ` · Frist ${formatDate(action.deadline)}` : ""}
                      {action.reminderAt
                        ? ` · Påmindelse ${formatDateTime(action.reminderAt)}`
                        : ""}
                      {action.followUpAt
                        ? ` · Opfølgning ${formatDateTime(action.followUpAt)}`
                        : ""}
                      {action.task?.responsible?.full_name
                        ? ` · Ansvarlig: ${action.task.responsible.full_name}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Link
                      className={buttonClassName({ size: "sm" })}
                      href={`${root}${action.href}`}
                    >
                      {action.type === "minutes_approval"
                        ? "Gennemgå referat"
                        : action.sourceType === "task"
                          ? "Åbn opgave"
                          : "Åbn aktivitet"}
                    </Link>
                    {view !== "completed" && canEditTask ? (
                      <Button
                        disabled={isPending}
                        onClick={() => completeTask(action)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Markér gennemført
                      </Button>
                    ) : null}
                    {view !== "completed" && action.type === "minutes_approval" ? (
                      <Button
                        disabled={isPending}
                        onClick={() => approveMinutes(action)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Godkend
                      </Button>
                    ) : null}
                    {view === "inbox" ? (
                      <Button
                        disabled={isPending}
                        onClick={() => updateState(action, "claim")}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Tag ansvar
                      </Button>
                    ) : null}
                  </div>
                </div>

                {view !== "completed" ? (
                  <details className={staticSurfaceClassName("mt-3 px-3 py-2")}>
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-brand">
                      Flere handlinger
                    </summary>
                    <div className="grid gap-4 border-t border-line pt-3 lg:grid-cols-3">
                      <div>
                        <p className="text-sm font-semibold">Mind mig senere</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {([
                            ["later", "Senere i dag"],
                            ["tomorrow", "I morgen"],
                            ["three_days", "Om 3 dage"],
                            ["next_week", "Næste uge"],
                          ] as const).map(([choice, label]) => (
                            <Button
                              disabled={isPending}
                              key={choice}
                              onClick={() =>
                                updateState(action, "snooze", {
                                  snoozedUntil: snoozeTime(choice),
                                })
                              }
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              {label}
                            </Button>
                          ))}
                        </div>
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <label className="text-xs font-semibold" htmlFor={`snooze-${action.key}`}>
                            Vælg dato
                            <input
                              className="field mt-1 block"
                              id={`snooze-${action.key}`}
                              min={new Date().toISOString().slice(0, 10)}
                              onChange={(event) =>
                                setCustomDates((current) => ({
                                  ...current,
                                  [action.key]: event.target.value,
                                }))
                              }
                              type="date"
                              value={customDates[action.key] ?? ""}
                            />
                          </label>
                          <Button
                            disabled={!customDates[action.key] || isPending}
                            onClick={() =>
                              updateState(action, "snooze", {
                                snoozedUntil: new Date(
                                  `${customDates[action.key]}T09:00:00`,
                                ).toISOString(),
                              })
                            }
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            Udskyd
                          </Button>
                        </div>
                      </div>

                      {canEditTask && action.task ? (
                        <div className="space-y-3">
                          <label className="block text-sm font-semibold">
                            Flyt deadline
                            <input
                              className="field mt-1 block w-full"
                              defaultValue={action.task.deadline ?? ""}
                              min={new Date().toISOString().slice(0, 10)}
                              onChange={(event) => {
                                if (event.target.value) {
                                  void updateTask(action, { deadline: event.target.value });
                                }
                              }}
                              type="date"
                            />
                          </label>
                          <label className="block text-sm font-semibold">
                            Delegér
                            <select
                              className="field mt-1 block w-full"
                              defaultValue={action.task.responsible_user_id ?? ""}
                              onChange={(event) => {
                                const member = memberOptions.get(event.target.value);
                                if (member) {
                                  void updateTask(action, {
                                    responsibleUserId: member.user_id,
                                  });
                                }
                              }}
                            >
                              {eligibleMembers.map((member) => (
                                <option key={member.user_id} value={member.user_id}>
                                  {member.full_name || member.email}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : (
                        <p className="text-sm text-muted">
                          Ændringer i den underliggende handling følger de eksisterende rettigheder.
                        </p>
                      )}

                      <div>
                        <p className="text-sm font-semibold">Ikke relevant</p>
                        <p className="mt-1 text-xs text-muted">
                          Skjuler kun handlingen for dig og ændrer ikke kildedata.
                        </p>
                        <select
                          aria-label="Årsag til ikke relevant"
                          className="field mt-2 block w-full"
                          defaultValue=""
                          disabled={isPending}
                          onChange={(event) => {
                            if (event.target.value) {
                              void updateState(action, "dismiss", {
                                dismissalReason: event.target.value,
                              });
                            }
                          }}
                        >
                          <option value="">Vælg årsag</option>
                          <option value="Ikke mit ansvar">Ikke mit ansvar</option>
                          <option value="Allerede håndteret">Allerede håndteret</option>
                          <option value="Ikke relevant">Ikke relevant</option>
                          <option value="Andet">Andet</option>
                        </select>
                      </div>
                    </div>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          description={
            view === "completed"
              ? "Afsluttede og personligt fravalgte handlinger vises her, når der er historik."
              : view === "mine"
                ? "Handlinger, du aktivt tager ansvar for, samles her."
                : "Der er ingen aktuelle forhold, som kræver din stillingtagen."
          }
          title={
            view === "completed"
              ? "Ingen afsluttede handlinger endnu"
              : view === "mine"
                ? "Du har ikke taget ansvar for nogen åbne handlinger"
                : "Din indbakke er tom"
          }
        />
      )}
    </div>
  );
}
