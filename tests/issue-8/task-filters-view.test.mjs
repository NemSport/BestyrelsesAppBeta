import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  emptyTaskFilters,
  parseTaskRegisterState,
  taskRegisterSearchParams,
} from "../../src/lib/task-register-state.ts";
import { getMeetingCapabilities } from "../../src/lib/meeting-capabilities.ts";
import {
  filterTasks,
  getTaskDeadlineState,
  taskBoardStatuses,
  taskStatusOptions,
} from "../../src/lib/tasks.ts";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [
  register,
  detail,
  modal,
  actionMenu,
  taskPage,
  globalStyles,
  taskService,
  taskRepository,
  taskPolicy,
  route,
] = await Promise.all([
  source("../../src/components/tasks/task-register.tsx"),
  source("../../src/components/tasks/task-register-detail.tsx"),
  source("../../src/components/ui/modal.tsx"),
  source("../../src/components/ui/action-menu.tsx"),
  source("../../src/app/(app)/organizations/[organizationId]/tasks/page.tsx"),
  source("../../src/app/globals.css"),
  source("../../src/services/task-service.ts"),
  source("../../src/repositories/task-repository.ts"),
  source("../../supabase/migrations/202606140001_task_foundation.sql"),
  source("../../src/app/api/organizations/[organizationId]/tasks/route.ts"),
]);

test("URL state validates filters and view mode", () => {
  const defaultState = parseTaskRegisterState(new URLSearchParams());
  assert.equal(defaultState.filters.mineOnly, true);

  const parsed = parseTaskRegisterState(
    new URLSearchParams(
      "view=task&q=budget&status=waiting&committee=c1&responsible=u1&category=Drift&deadline=soon&mine=1&archived=1",
    ),
  );

  assert.equal(parsed.view, "task");
  assert.deepEqual(parsed.filters, {
    search: "budget",
    status: "waiting",
    committeeId: "c1",
    responsibleUserId: "u1",
    category: "Drift",
    deadline: "soon",
    mineOnly: true,
    showArchived: true,
  });

  const invalid = parseTaskRegisterState(
    new URLSearchParams("view=board&status=unknown&deadline=later"),
  );
  assert.equal(invalid.view, "task");
  assert.equal(invalid.filters.status, "");
  assert.equal(invalid.filters.deadline, "");

  const allList = parseTaskRegisterState(
    new URLSearchParams("view=list&scope=all"),
  );
  assert.equal(allList.view, "list");
  assert.equal(allList.filters.mineOnly, false);
});

test("serialization omits defaults and preserves unrelated deep-link state", () => {
  const filters = {
    ...emptyTaskFilters(),
    committeeId: "committee-1",
    mineOnly: true,
  };
  const params = taskRegisterSearchParams(
    new URLSearchParams("editTask=task-1&q=stale&archived=1"),
    { filters, view: "task" },
  );

  assert.equal(params.toString(), "editTask=task-1&committee=committee-1");

  const reset = taskRegisterSearchParams(params, {
    filters: emptyTaskFilters(),
    view: "task",
  });
  assert.equal(reset.toString(), "editTask=task-1");

  const allList = taskRegisterSearchParams(reset, {
    filters: { ...emptyTaskFilters(), mineOnly: false },
    view: "list",
  });
  assert.equal(allList.toString(), "editTask=task-1&view=list&scope=all");
});

test("Mine and Alle scope only filter the already accessible task collection", () => {
  const accessibleTasks = [
    {
      id: "mine",
      archived_at: null,
      status: "not_started",
      responsible_user_id: "user-1",
      committee_id: "committee-1",
      category: null,
      deadline: null,
      title: "Min opgave",
      description: "",
    },
    {
      id: "colleague",
      archived_at: null,
      status: "in_progress",
      responsible_user_id: "user-2",
      committee_id: "committee-1",
      category: null,
      deadline: null,
      title: "Kollegas opgave",
      description: "",
    },
  ];

  assert.deepEqual(
    filterTasks(accessibleTasks, emptyTaskFilters(), "user-1").map(
      (task) => task.id,
    ),
    ["mine"],
  );
  assert.deepEqual(
    filterTasks(
      accessibleTasks,
      { ...emptyTaskFilters(), mineOnly: false },
      "user-1",
    ).map((task) => task.id),
    ["mine", "colleague"],
  );
});

test("Board and list share one filtered collection and URL contract", () => {
  assert.match(register, /const filteredTasks = useMemo/);
  assert.match(register, /viewMode === "task"/);
  assert.match(register, /const activeBoardTasks = filteredTasks\.filter/);
  assert.match(register, /columnTasks = activeBoardTasks\.filter/);
  assert.match(register, /filteredTasks\.map\(\(task\) => taskRow\(task\)\)/);
  assert.match(register, /router\.replace/);
  assert.match(register, /scroll: false/);
  assert.match(register, /parseTaskRegisterState/);
  assert.match(register, /taskRegisterSearchParams/);
  assert.match(register, />\s*Board\s*</);
  assert.match(register, />\s*Liste\s*</);
  assert.doesNotMatch(register, />\s*Kanban\s*</);
});

test("primary and advanced filters expose results, active state, and reset", () => {
  assert.match(register, /htmlFor="task-search"/);
  assert.match(register, /htmlFor="task-status-filter"/);
  assert.match(register, /htmlFor="task-committee-filter"/);
  assert.match(register, /htmlFor="task-deadline-filter"/);
  assert.match(register, /Flere filtre/);
  assert.match(register, /activeFilterLabels\.map/);
  assert.match(register, /aria-label=\{`Fjern filter:/);
  assert.match(register, /Ryd alle filtre/);
  assert.match(register, /aria-live="polite"/);
  assert.match(
    register,
    /filteredTasks\.length\} af \{tasks\.length\} opgaver/,
  );
});

test("final polish keeps tasks locally full-width with one compact toolbar", () => {
  assert.match(taskPage, /data-task-register-page/);
  assert.match(
    globalStyles,
    /\.org-layout-content:has\(> \[data-task-register-page\]\)[\s\S]*max-width: none/,
  );
  assert.match(register, /xl:grid-cols-\[minmax\(13rem,1\.35fr\)_repeat/);
  assert.match(register, /aria-expanded=\{showMoreFilters\}/);
  assert.match(register, /<AppIcon name="filter" size=\{14\}/);
  assert.match(register, /xl:flex-row xl:items-center/);
  assert.match(register, /lg:grid-cols-3/);
  assert.match(register, /showChevron=\{false\}/);
  assert.match(register, /triggerClassName="!size-8/);
  assert.match(actionMenu, /triggerClassName/);
  assert.match(actionMenu, /showChevron \? \(/);
});

test("viewer is read-only while editor roles keep task actions", () => {
  const viewer = getMeetingCapabilities("viewer", "viewer");
  const member = getMeetingCapabilities("member", "member");
  const chair = getMeetingCapabilities("member", "chair");
  const admin = getMeetingCapabilities("admin", null);

  assert.equal(viewer.editTasks, false);
  assert.equal(member.editTasks, true);
  assert.equal(chair.editTasks, true);
  assert.equal(admin.editTasks, true);
  assert.match(register, /if \(!canEdit\) return null/);
  assert.match(register, /\{canCreate \? \(/);
  assert.match(register, /<Button onClick=\{openCreate\} size="sm">/);
  assert.doesNotMatch(register, /disabled=\{!canCreate\}/);
});

test("Version 3.4 board contains three active columns and a collapsed completed area", () => {
  assert.deepEqual(taskBoardStatuses, [
    "not_started",
    "in_progress",
    "waiting",
  ]);
  assert.equal(taskBoardStatuses.includes("completed"), false);
  assert.equal(taskBoardStatuses.includes("cancelled"), false);
  assert.match(register, /lg:grid-cols-3/);
  assert.match(register, /aria-label="Vælg statuskolonne"/);
  assert.match(register, /mobileBoardStatus === status/);
  assert.doesNotMatch(
    register,
    /aria-label="Task Board"[\s\S]{0,200}overflow-x-auto/,
  );
  assert.match(
    register,
    /const completedTasks = filteredTasks\.filter\(\s*\(task\) => task\.status === "completed"/,
  );
  assert.match(register, /<details className="group rounded/);
  assert.match(register, /gennemførte opgaver/);
  assert.match(register, /Annullerede opgaver kan ses i listevisningen/);

  const boardRenderer = register.match(
    /aria-label="Task Board"[\s\S]*?\{completedTasks\.length > 0 \? \(/,
  )?.[0];
  assert.ok(boardRenderer);
  assert.match(boardRenderer, /taskBoardStatuses\.map/);
  assert.doesNotMatch(boardRenderer, /taskStatusOptions\.map/);
});

test("deadline urgency remains separate from terminal task status", () => {
  const today = new Date(2026, 7, 9);
  assert.equal(
    getTaskDeadlineState(
      { deadline: "2026-08-08", status: "not_started" },
      today,
    ),
    "overdue",
  );
  assert.equal(
    getTaskDeadlineState({ deadline: "2026-08-16", status: "waiting" }, today),
    "soon",
  );
  assert.equal(
    getTaskDeadlineState(
      { deadline: "2026-08-08", status: "completed" },
      today,
    ),
    "closed",
  );
  assert.equal(
    getTaskDeadlineState(
      { deadline: "2026-08-08", status: "cancelled" },
      today,
    ),
    "closed",
  );
});

test("task details use the shared accessible modal as a right-side sheet", () => {
  assert.match(register, /openDetail\(task\)/);
  assert.match(register, /<TaskRegisterDetail/);
  assert.match(detail, /placement="right"/);
  assert.match(detail, /<TaskComments/);
  assert.match(detail, /meetingHref \|\| agendaHref \|\| task\.decision/);
  assert.match(detail, /onStatusChange\("completed"\)/);
  assert.match(modal, /useDialogFocus/);
  assert.match(modal, /placement === "right"/);
});

test("consolidated V2 retains the former personal-task actions and context", () => {
  assert.match(register, /taskStatusOptions\.map/);
  assert.match(register, /void changeStatus\(task, option\.value\)/);
  assert.match(register, /openEdit\(task\)/);
  assert.match(detail, /onStatusChange\("completed"\)/);
  assert.match(detail, /meetingHref/);
  assert.match(detail, /agendaHref/);
  assert.match(detail, /task\.decision/);
  assert.match(register, /const completedTasks = filteredTasks\.filter/);
  assert.equal(
    taskStatusOptions.some((option) => option.value === "completed"),
    true,
  );
  assert.equal(
    taskStatusOptions.some((option) => option.value === "cancelled"),
    true,
  );
  assert.match(register, /Annullerede opgaver kan ses i listevisningen/);
});

test("task form follows pending, validation, success, and dirty-state patterns", () => {
  assert.match(register, /useMutationFeedback/);
  assert.match(register, /useUnsavedChanges/);
  assert.match(register, /JSON\.stringify\(draft\)/);
  assert.match(register, /readMutationResponse/);
  assert.match(register, /focusInvalidField/);
  assert.match(register, /MutationFeedback feedback=\{mutation\.feedback\}/);
  assert.match(register, /aria-invalid=\{Boolean\(fieldErrors\.title\)\}/);
  assert.match(register, /form="task-register-form"/);
  assert.match(register, /Relationer, påmindelse og intern note/);
});

test("server and RLS retain scoped editor authorization and audit fields", () => {
  assert.match(taskService, /requireAgendaItemEditor/);
  assert.match(taskService, /requireValidReferences/);
  assert.match(taskService, /created_by: user\.id/);
  assert.match(taskService, /updated_by: user\.id/);
  assert.match(taskRepository, /\.eq\("organization_id", organizationId\)/);
  assert.match(taskRepository, /\.insert\(input\)/);
  assert.match(taskRepository, /\.single\(\)/);
  assert.match(taskPolicy, /create policy tasks_select_member/);
  assert.match(taskPolicy, /create policy tasks_insert_editor/);
  assert.match(taskPolicy, /create policy tasks_update_editor/);
  assert.match(taskPolicy, /validate_task_scope/);
  assert.match(route, /TaskService/);
});
