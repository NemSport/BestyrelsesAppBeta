import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  emptyTaskFilters,
  parseTaskRegisterState,
  taskRegisterSearchParams,
} from "../../src/lib/task-register-state.ts";
import { getMeetingCapabilities } from "../../src/lib/meeting-capabilities.ts";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [register, taskService, taskRepository, taskPolicy, route] =
  await Promise.all([
    source("../../src/components/tasks/task-register.tsx"),
    source("../../src/services/task-service.ts"),
    source("../../src/repositories/task-repository.ts"),
    source("../../supabase/migrations/202606140001_task_foundation.sql"),
    source("../../src/app/api/organizations/[organizationId]/tasks/route.ts"),
  ]);

test("URL state validates filters and view mode", () => {
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
  assert.equal(invalid.view, "list");
  assert.equal(invalid.filters.status, "");
  assert.equal(invalid.filters.deadline, "");
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

  assert.equal(
    params.toString(),
    "editTask=task-1&view=task&committee=committee-1&mine=1",
  );

  const reset = taskRegisterSearchParams(params, {
    filters: emptyTaskFilters(),
    view: "task",
  });
  assert.equal(reset.toString(), "editTask=task-1&view=task");
});

test("list and Task View share one filtered collection and URL contract", () => {
  assert.match(register, /const filteredTasks = useMemo/);
  assert.match(register, /viewMode === "task"/);
  assert.match(register, /columnTasks = filteredTasks\.filter/);
  assert.match(register, /filteredTasks\.map\(\(task\) => taskRow\(task\)\)/);
  assert.match(register, /router\.replace/);
  assert.match(register, /scroll: false/);
  assert.match(register, /parseTaskRegisterState/);
  assert.match(register, /taskRegisterSearchParams/);
  assert.match(register, />\s*Task View\s*</);
  assert.doesNotMatch(register, />\s*Kanban\s*</);
});

test("primary and advanced filters expose results, active state, and reset", () => {
  assert.match(register, /htmlFor="task-search"/);
  assert.match(register, /htmlFor="task-status-filter"/);
  assert.match(register, /htmlFor="task-committee-filter"/);
  assert.match(register, /Avancerede filtre/);
  assert.match(register, /activeFilterLabels\.map/);
  assert.match(register, /aria-label=\{`Fjern filter:/);
  assert.match(register, /Ryd alle filtre/);
  assert.match(register, /aria-live="polite"/);
  assert.match(
    register,
    /filteredTasks\.length\} af \{tasks\.length\} opgaver/,
  );
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
  assert.match(
    register,
    /\{canCreate \? \(\s*<Button onClick=\{openCreate\}>Opret opgave<\/Button>/,
  );
  assert.doesNotMatch(register, /disabled=\{!canCreate\}/);
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
