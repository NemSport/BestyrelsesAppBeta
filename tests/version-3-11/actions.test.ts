import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  applyPersonalActionStates,
  deriveActiveActions,
} from "../../src/lib/actions";
import type { ActionPersonalState, TaskView } from "../../src/types/domain";

const organizationId = "11111111-1111-4111-8111-111111111111";
const committeeId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const otherUserId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-08-24T10:00:00.000Z");

function task(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    organization_id: organizationId,
    committee_id: committeeId,
    meeting_id: null,
    agenda_item_id: null,
    decision_id: null,
    stakeholder_id: null,
    stakeholder_contract_id: null,
    role_profile_id: null,
    task_template_id: null,
    annual_wheel_event_id: null,
    annual_wheel_task_template_id: null,
    annual_wheel_activation_year: null,
    title: "Indsend budget",
    description: "",
    status: "not_started",
    responsible_user_id: userId,
    deadline: "2026-08-23",
    reminder_at: null,
    reminder_sent_at: null,
    last_notified_at: null,
    category: null,
    internal_note: null,
    created_by: userId,
    updated_by: userId,
    created_at: "2026-08-20T10:00:00.000Z",
    updated_at: "2026-08-20T10:00:00.000Z",
    archived_at: null,
    completed_at: null,
    committee: { id: committeeId, name: "Økonomi" },
    meeting: null,
    agendaItem: null,
    decision: null,
    responsible: { id: userId, full_name: "Ada" },
    ...overrides,
  };
}

function state(
  actionKey: string,
  overrides: Partial<ActionPersonalState> = {},
): ActionPersonalState {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    organization_id: organizationId,
    user_id: userId,
    action_key: actionKey,
    action_type: "task_overdue",
    source_type: "task",
    source_id: "55555555-5555-4555-8555-555555555555",
    status: "claimed",
    snoozed_until: null,
    dismissal_reason: null,
    first_seen_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    resolved_at: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  };
}

function derive(tasks: TaskView[]) {
  return deriveFor(userId, tasks, now);
}

function deriveFor(targetUserId: string, tasks: TaskView[], at: Date) {
  return deriveActiveActions({
    organizationId,
    userId: targetUserId,
    tasks,
    approvals: [],
    annualWheelEvents: [],
    now: at,
  });
}

test("overdue assigned task is a critical action", () => {
  const [action] = derive([task()]);
  assert.equal(action.type, "task_overdue");
  assert.equal(action.priority, "critical");
  assert.equal(action.daysUntil, -1);
});

test("far-future task without a deadline trigger is excluded", () => {
  assert.deepEqual(derive([task({ deadline: "2026-09-20" })]), []);
});

test("completed tasks disappear automatically", () => {
  assert.deepEqual(
    derive([task({ status: "completed", completed_at: now.toISOString() })]),
    [],
  );
});

test("snoozed actions hide until the snooze expires", () => {
  const actions = derive([task()]);
  const hidden = applyPersonalActionStates(
    actions,
    [
      state(actions[0].key, {
        status: "snoozed",
        snoozed_until: "2026-08-25T10:00:00.000Z",
      }),
    ],
    now,
  );
  assert.equal(hidden[0].state, "snoozed");

  const returned = applyPersonalActionStates(
    actions,
    [
      state(actions[0].key, {
        status: "snoozed",
        snoozed_until: "2026-08-24T09:00:00.000Z",
      }),
    ],
    now,
  );
  assert.equal(returned[0].state, "inbox");
});

test("dismissal is personal and does not mutate source data", () => {
  const source = task();
  const before = structuredClone(source);
  const actions = derive([source]);
  const personalized = applyPersonalActionStates(
    actions,
    [
      state(actions[0].key, {
        status: "dismissed",
        dismissal_reason: "Ikke mit ansvar",
      }),
    ],
    now,
  );
  assert.equal(personalized[0].state, "dismissed");
  assert.deepEqual(source, before);
});

test("stable identity deduplicates the same source", () => {
  assert.equal(derive([task(), task()]).length, 1);
});

test("user and organization isolation are applied before ranking", () => {
  assert.deepEqual(
    derive([
      task({ responsible_user_id: otherUserId }),
      task({ organization_id: "77777777-7777-4777-8777-777777777777" }),
    ]),
    [],
  );
});

test("future reminder is inactive and reached reminder becomes an action", () => {
  assert.deepEqual(
    derive([task({ deadline: null, reminder_at: "2026-08-26T10:00:00.000Z" })]),
    [],
  );
  const [action] = derive([
    task({ deadline: null, reminder_at: "2026-08-24T09:59:00.000Z" }),
  ]);
  assert.equal(action.type, "task_reminder");
  assert.equal(action.priority, "follow_up");
  assert.equal(action.reminderAt, "2026-08-24T09:59:00.000Z");
});

test("task without reminder, completed task and cancelled task do not create reminder actions", () => {
  assert.deepEqual(derive([task({ deadline: null, reminder_at: null })]), []);
  assert.deepEqual(
    derive([
      task({
        deadline: null,
        reminder_at: "2026-08-24T09:00:00.000Z",
        status: "completed",
        completed_at: now.toISOString(),
      }),
    ]),
    [],
  );
  assert.deepEqual(
    derive([
      task({
        deadline: null,
        reminder_at: "2026-08-24T09:00:00.000Z",
        status: "cancelled",
      }),
    ]),
    [],
  );
});

test("editing reminder to the future or clearing it removes the derived action", () => {
  const due = task({ deadline: null, reminder_at: "2026-08-24T09:00:00.000Z" });
  assert.equal(derive([due]).length, 1);
  assert.deepEqual(
    derive([{ ...due, reminder_at: "2026-08-25T09:00:00.000Z" }]),
    [],
  );
  assert.deepEqual(derive([{ ...due, reminder_at: null }]), []);
});

test("reminder snooze and dismissal stay personal and preserve source reminder", () => {
  const source = task({
    deadline: null,
    reminder_at: "2026-08-24T09:00:00.000Z",
  });
  const [action] = derive([source]);
  const snoozed = applyPersonalActionStates(
    [action],
    [
      state(action.key, {
        action_type: "task_reminder",
        status: "snoozed",
        snoozed_until: "2026-08-25T10:00:00.000Z",
      }),
    ],
    now,
  );
  assert.equal(snoozed[0].state, "snoozed");
  assert.equal(source.reminder_at, "2026-08-24T09:00:00.000Z");

  const dismissed = applyPersonalActionStates(
    [action],
    [state(action.key, { action_type: "task_reminder", status: "dismissed" })],
    now,
  );
  assert.equal(dismissed[0].state, "dismissed");
});

test("changed reminder has a new identity after an earlier dismissal", () => {
  const [oldAction] = derive([
    task({ deadline: null, reminder_at: "2026-08-24T09:00:00.000Z" }),
  ]);
  const [newAction] = derive([
    task({ deadline: null, reminder_at: "2026-08-24T09:30:00.000Z" }),
  ]);
  const personalized = applyPersonalActionStates(
    [newAction],
    [
      state(oldAction.key, {
        action_type: "task_reminder",
        status: "dismissed",
      }),
    ],
    now,
  );
  assert.notEqual(oldAction.key, newAction.key);
  assert.equal(personalized[0].state, "inbox");
});

test("deadline reasons outrank reminder without duplicate rows", () => {
  const reminderAt = "2026-08-24T09:00:00.000Z";
  const [soon] = derive([
    task({ deadline: "2026-08-26", reminder_at: reminderAt }),
  ]);
  assert.equal(soon.type, "task_due_soon");
  assert.equal(
    derive([task({ deadline: "2026-08-26", reminder_at: reminderAt })]).length,
    1,
  );
  const [overdue] = derive([
    task({ deadline: "2026-08-23", reminder_at: reminderAt }),
  ]);
  assert.equal(overdue.type, "task_overdue");
  assert.equal(
    derive([task({ deadline: "2026-08-23", reminder_at: reminderAt })]).length,
    1,
  );
});

test("reminder follows current task assignment before and after it is reached", () => {
  const reminderTask = task({
    deadline: null,
    reminder_at: "2026-08-24T09:00:00.000Z",
  });
  assert.equal(deriveFor(userId, [reminderTask], now).length, 1);
  assert.equal(deriveFor(otherUserId, [reminderTask], now).length, 0);
  const delegated = { ...reminderTask, responsible_user_id: otherUserId };
  assert.equal(deriveFor(userId, [delegated], now).length, 0);
  assert.equal(deriveFor(otherUserId, [delegated], now).length, 1);
});

test("reminder compares absolute UTC instants from datetime-local conversion", () => {
  const copenhagenReminderUtc = "2026-08-24T21:34:00.000Z";
  assert.equal(
    deriveFor(
      userId,
      [task({ deadline: null, reminder_at: copenhagenReminderUtc })],
      new Date("2026-08-24T21:33:59.000Z"),
    ).length,
    0,
  );
  assert.equal(
    deriveFor(
      userId,
      [task({ deadline: null, reminder_at: copenhagenReminderUtc })],
      new Date("2026-08-24T21:34:00.000Z"),
    )[0].type,
    "task_reminder",
  );
});

test("dashboard, navigation and center share ActionService", async () => {
  const root = process.cwd();
  const [
    page,
    layout,
    dashboard,
    component,
    refresh,
    migration,
    reminderMigration,
  ] = await Promise.all([
    readFile(
      path.join(root, "src/app/(app)/organizations/[organizationId]/page.tsx"),
      "utf8",
    ),
    readFile(
      path.join(
        root,
        "src/app/(app)/organizations/[organizationId]/layout.tsx",
      ),
      "utf8",
    ),
    readFile(
      path.join(
        root,
        "src/components/dashboard/organization-dashboard-priority.tsx",
      ),
      "utf8",
    ),
    readFile(
      path.join(root, "src/components/actions/action-center.tsx"),
      "utf8",
    ),
    readFile(
      path.join(root, "src/components/actions/action-refresh.tsx"),
      "utf8",
    ),
    readFile(
      path.join(root, "supabase/migrations/202608240001_action_center_v1.sql"),
      "utf8",
    ),
    readFile(
      path.join(
        root,
        "supabase/migrations/202608240002_task_reminder_actions.sql",
      ),
      "utf8",
    ),
  ]);
  assert.match(page, /new ActionService\(db\)\.getCenter/);
  assert.match(layout, /activeActionCount=\{actionCenter\.activeCount\}/);
  assert.match(dashboard, /actionCenter\.inbox/);
  assert.match(component, /grid min-w-0 gap-3 md:grid-cols/);
  assert.match(component, /requireAgendaItemEditor|editableCommitteeIds/);
  assert.match(component, /Påmindelse[\s\S]*formatDateTime/);
  assert.match(refresh, /visibilitychange/);
  assert.match(refresh, /nextRefreshAt/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(migration, /public\.is_organization_member\(organization_id\)/);
  assert.doesNotMatch(migration, /task title|meeting title/i);
  assert.match(reminderMigration, /'task_reminder'/);
  assert.doesNotMatch(reminderMigration, /create table|reminder payload/i);
});
