"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppIcon } from "@/components/icons/app-icon";

import {
  Button,
  EmptyState,
  StatusBadge,
  Input,
  Modal,
  Select,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/localization";
import type { ActionCenterData, ActionItem, TaskView } from "@/types/domain";

type ActionView = "inbox" | "mine" | "completed";
type ActionOption = "snooze" | "deadline" | "delegate" | "dismiss";

const viewLabels = {
  inbox: "Min indbakke",
  mine: "Mine handlinger",
  completed: "Afsluttet",
} satisfies Record<ActionView, string>;

const optionLabels = {
  snooze: "Mind mig senere",
  deadline: "Flyt frist",
  delegate: "Delegér",
  dismiss: "Ikke relevant",
} satisfies Record<ActionOption, string>;

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
    const daysUntilMonday = (8 - value.getDay()) % 7 || 7;
    value.setDate(value.getDate() + daysUntilMonday);
    value.setHours(9, 0, 0, 0);
  }
  return value.toISOString();
}

function taskPayload(
  task: TaskView,
  overrides: Partial<{
    responsibleUserId: string | null;
    deadline: string | null;
  }>,
) {
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
    deadline:
      overrides.deadline === undefined ? task.deadline : overrides.deadline,
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
  const [visibleCount, setVisibleCount] = useState(5);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [option, setOption] = useState<ActionOption | null>(null);
  const [value, setValue] = useState("");
  const actions = center[view];
  const root = `/organizations/${organizationId}`;
  const selected = actions.find((action) => action.key === selectedKey);
  const task = selected?.task;
  const canEditTask =
    task && center.editableCommitteeIds.includes(task.committee_id);
  const eligibleMembers = task
    ? center.delegationMembers.filter((member) =>
        member.committees.some(
          (committee) => committee.id === task.committee_id,
        ),
      )
    : [];
  const isPending = pendingKey !== null;

  function finish() {
    setSelectedKey(null);
    router.refresh();
  }

  function chooseOption(next: ActionOption | null) {
    setError(null);
    setOption(next);
    setValue("");
  }

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
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!response.ok)
      throw new Error(result?.error || "Handlingen kunne ikke gemmes.");
  }

  function personalStatePayload(
    action: ActionItem,
    operation: "claim" | "snooze" | "dismiss",
  ) {
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
      finish();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Handlingen kunne ikke gemmes.",
      );
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
      finish();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Opgaven kunne ikke afsluttes.",
      );
    } finally {
      setPendingKey(null);
    }
  }

  async function updateTask(
    action: ActionItem,
    overrides: Partial<{
      responsibleUserId: string | null;
      deadline: string | null;
    }>,
  ) {
    if (!action.task) return;
    setPendingKey(action.key);
    setError(null);
    try {
      await request(
        `/api/organizations/${organizationId}/actions`,
        personalStatePayload(action, "claim"),
      );
      await request(
        `/api/tasks/${action.task.id}`,
        taskPayload(action.task, overrides),
      );
      finish();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Opgaven kunne ikke opdateres.",
      );
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
      finish();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Referatet kunne ikke godkendes.",
      );
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        <label htmlFor="overview-action-filter" className="text-xs text-muted">
          Vis
        </label>
        <Select
          id="overview-action-filter"
          className="!w-auto"
          value={view}
          onChange={(event) =>
            router.replace(
              `${root}?handlinger=${event.target.value}#handlinger`,
              { scroll: false },
            )
          }
        >
          {(Object.keys(viewLabels) as ActionView[]).map((key) => (
            <option key={key} value={key}>
              {viewLabels[key]} ({center[key].length})
            </option>
          ))}
        </Select>
      </div>

      {actions.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {actions.slice(0, visibleCount).map((action) => (
            <li
              className="flex min-h-14 items-center gap-2 py-1.5 sm:gap-3"
              data-action-key={action.key}
              key={action.key}
            >
              <Link
                href={`${root}${action.href}`}
                className="min-w-0 flex-1 py-1 text-sm hover:underline"
              >
                <span className="block break-words font-semibold text-brand">
                  {action.title}
                </span>
                <span className="block text-xs text-muted">
                  {action.context}
                  {action.deadline
                    ? ` · Frist ${formatDate(action.deadline)}`
                    : ""}
                </span>
              </Link>
              <StatusBadge tone={priorityTones[action.priority]}>
                {priorityLabels[action.priority]}
              </StatusBadge>
              {view !== "completed" ? (
                <Button
                  aria-label={`Flere handlinger for ${action.title}`}
                  variant="secondary"
                  size="sm"
                  className="!size-11 shrink-0 !p-0"
                  onClick={() => {
                    chooseOption(null);
                    setSelectedKey(action.key);
                  }}
                >
                  <AppIcon name="more" size={18} />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={
            view === "completed"
              ? "Ingen afsluttede handlinger"
              : "Ingen handlinger her"
          }
        />
      )}
      {actions.length > visibleCount ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setVisibleCount(visibleCount + 5)}
        >
          Vis flere handlinger
        </Button>
      ) : null}

      {selected ? (
        <Modal
          open
          onClose={() => {
            if (!isPending) setSelectedKey(null);
          }}
          title={option ? optionLabels[option] : "Flere handlinger"}
          description={selected.title}
          maxWidth="lg"
        >
          {error ? (
            <p
              className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {!option ? (
            <>
              <p className="mb-3 text-sm text-muted">{selected.description}</p>
              {selected.reminderAt || selected.followUpAt ? (
                <p className="mb-3 text-xs text-muted">
                  {selected.reminderAt
                    ? `Påmindelse ${formatDateTime(selected.reminderAt)}`
                    : ""}
                  {selected.reminderAt && selected.followUpAt ? " · " : ""}
                  {selected.followUpAt
                    ? `Opfølgning ${formatDateTime(selected.followUpAt)}`
                    : ""}
                </p>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {canEditTask ? (
                  <Button
                    disabled={isPending}
                    variant="secondary"
                    onClick={() => completeTask(selected)}
                  >
                    Markér gennemført
                  </Button>
                ) : null}
                {selected.type === "minutes_approval" ? (
                  <Button
                    disabled={isPending}
                    variant="secondary"
                    onClick={() => approveMinutes(selected)}
                  >
                    Godkend referat
                  </Button>
                ) : null}
                {view === "inbox" ? (
                  <Button
                    disabled={isPending}
                    variant="secondary"
                    onClick={() => updateState(selected, "claim")}
                  >
                    Tag ansvar
                  </Button>
                ) : null}
                <Button
                  disabled={isPending}
                  variant="secondary"
                  onClick={() => chooseOption("snooze")}
                >
                  {optionLabels.snooze}
                </Button>
                {canEditTask ? (
                  <Button
                    disabled={isPending}
                    variant="secondary"
                    onClick={() => chooseOption("deadline")}
                  >
                    {optionLabels.deadline}
                  </Button>
                ) : null}
                {canEditTask && eligibleMembers.length ? (
                  <Button
                    disabled={isPending}
                    variant="secondary"
                    onClick={() => chooseOption("delegate")}
                  >
                    {optionLabels.delegate}
                  </Button>
                ) : null}
                <Button
                  disabled={isPending}
                  variant="secondary"
                  onClick={() => chooseOption("dismiss")}
                >
                  {optionLabels.dismiss}
                </Button>
              </div>
            </>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!value || isPending) return;
                switch (option) {
                  case "deadline":
                    void updateTask(selected, { deadline: value });
                    break;
                  case "delegate":
                    void updateTask(selected, { responsibleUserId: value });
                    break;
                  case "dismiss":
                    void updateState(selected, "dismiss", {
                      dismissalReason: value,
                    });
                    break;
                  case "snooze":
                    void updateState(selected, "snooze", {
                      snoozedUntil: new Date(`${value}T09:00:00`).toISOString(),
                    });
                    break;
                }
              }}
            >
              {option === "snooze" ? (
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["later", "Senere i dag"],
                      ["tomorrow", "I morgen"],
                      ["three_days", "Om 3 dage"],
                      ["next_week", "Næste uge"],
                    ] as const
                  ).map(([choice, label]) => (
                    <Button
                      key={choice}
                      type="button"
                      variant="secondary"
                      disabled={isPending}
                      onClick={() =>
                        updateState(selected, "snooze", {
                          snoozedUntil: snoozeTime(choice),
                        })
                      }
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              ) : null}

              <label className="block space-y-1 text-sm font-semibold">
                <span>
                  {option === "delegate"
                    ? "Vælg ansvarlig"
                    : option === "dismiss"
                      ? "Vælg årsag"
                      : "Vælg dato"}
                </span>
                {option === "snooze" || option === "deadline" ? (
                  <Input
                    type="date"
                    className="block w-full"
                    required
                    disabled={isPending}
                    min={new Date().toISOString().slice(0, 10)}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                  />
                ) : (
                  <Select
                    className="block w-full"
                    required
                    disabled={isPending}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                  >
                    <option value="" disabled>
                      Vælg…
                    </option>
                    {option === "delegate"
                      ? eligibleMembers.map((member) => (
                          <option key={member.user_id} value={member.user_id}>
                            {member.full_name || member.email}
                          </option>
                        ))
                      : [
                          "Ikke mit ansvar",
                          "Allerede håndteret",
                          "Ikke relevant",
                          "Andet",
                        ].map((reason) => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                  </Select>
                )}
              </label>
              {option === "dismiss" ? (
                <p className="text-sm text-muted">
                  Handlingen skjules for dig.
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => chooseOption(null)}
                >
                  Tilbage
                </Button>
                <Button type="submit" disabled={!value || isPending}>
                  {option === "dismiss"
                    ? "Skjul handling"
                    : option === "snooze"
                      ? "Udskyd"
                      : "Gem"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      ) : null}
    </div>
  );
}
