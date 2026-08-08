import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  isOpenTransferredTask,
  mergeTransferredTaskReferences,
} from "../../src/lib/transferred-task-references.ts";

const workspace = process.cwd();
const read = (relativePath) =>
  readFile(path.join(workspace, relativePath), "utf8");

function task(id, status = "not_started", overrides = {}) {
  return {
    id,
    status,
    archived_at: null,
    title: `Opgave ${id}`,
    ...overrides,
  };
}

test("transferred points show zero, one or many open source tasks without copies", () => {
  assert.deepEqual(mergeTransferredTaskReferences([], []), []);

  const one = task("original-1", "in_progress");
  assert.deepEqual(mergeTransferredTaskReferences([], [one]), [one]);

  const many = [
    task("original-1", "in_progress"),
    task("original-2", "waiting"),
    task("original-3", "not_started"),
  ];
  assert.deepEqual(
    mergeTransferredTaskReferences([], many).map(({ id }) => id),
    ["original-1", "original-2", "original-3"],
  );
  assert.equal(
    mergeTransferredTaskReferences([one], many).filter(
      ({ id }) => id === "original-1",
    ).length,
    1,
  );
});

test("completed, cancelled and archived tasks stay in history instead of active references", () => {
  assert.equal(isOpenTransferredTask(task("open", "not_started")), true);
  assert.equal(isOpenTransferredTask(task("progress", "in_progress")), true);
  assert.equal(isOpenTransferredTask(task("waiting", "waiting")), true);
  assert.equal(isOpenTransferredTask(task("done", "completed")), false);
  assert.equal(isOpenTransferredTask(task("cancelled", "cancelled")), false);
  assert.equal(
    isOpenTransferredTask(
      task("archived", "waiting", { archived_at: "2026-08-06" }),
    ),
    false,
  );
  assert.deepEqual(
    mergeTransferredTaskReferences(
      [],
      [
        task("open", "waiting"),
        task("done", "completed"),
        task("cancelled", "cancelled"),
      ],
    ).map(({ id }) => id),
    ["open"],
  );
});

test("service exposes original task ids and redacts internal notes for read-only users", async () => {
  const [service, repository] = await Promise.all([
    read("src/services/transferred-agenda-item-service.ts"),
    read("src/repositories/task-repository.ts"),
  ]);

  assert.match(service, /sourceTasks:\s*sourceTasksByAgendaItemId/);
  assert.match(
    service,
    /canEditSourceTasks \? task : \{ \.\.\.task, internal_note: null \}/,
  );
  assert.match(service, /requireAgendaItemEditor/);
  assert.match(repository, /listByAgendaItems/);
  assert.doesNotMatch(repository, /insert[\s\S]*listByAgendaItems/);
});

test("scheduler creates a new point but does not copy minutes, decisions, follow-up or tasks", async () => {
  const migration = await read(
    "supabase/migrations/202608060002_transferred_task_references_hotfix.sql",
  );
  const values = migration.slice(
    migration.indexOf("insert into public.agenda_items"),
    migration.indexOf("returning * into created_item"),
  );

  assert.match(values, /source_item\.id/);
  assert.match(values, /left\(source_item\.description, 10000\)/);
  assert.doesNotMatch(values, /source_minutes\.(notes|decision|follow_up)/);
  assert.doesNotMatch(migration, /insert into public\.tasks/i);
  assert.match(migration, /target_agenda_item_id = created_item\.id/);
});

test("meeting UI opens the transfer origin in the shared accessible modal", async () => {
  const [meeting, relatedTasks, taskModal, modal, focusHook] =
    await Promise.all([
      read("src/components/meetings/meeting-minutes-section.tsx"),
      read("src/components/tasks/related-tasks.tsx"),
      read("src/components/tasks/task-detail-modal.tsx"),
      read("src/components/ui/modal.tsx"),
      read("src/hooks/use-dialog-focus.ts"),
    ]);

  assert.match(meeting, /Videreført fra/);
  assert.match(meeting, /sourceOccurrence\.position/);
  assert.match(meeting, /onClick=\{\(\) => setSourceModalOpen\(true\)\}/);
  const originTrigger = meeting.slice(
    meeting.indexOf("{incomingTransfer?.sourceMeeting ? ("),
    meeting.indexOf("</button>", meeting.indexOf("{incomingTransfer?.sourceMeeting ? (")),
  );
  assert.doesNotMatch(originTrigger, /href=/);
  assert.match(meeting, /open=\{sourceModalOpen\}/);
  assert.match(meeting, /Åbn oprindeligt møde/);
  assert.match(meeting, /incomingTransfer\.sourceMinutes/);
  assert.match(meeting, /incomingTransfer\.sourceTasks\.map/);
  assert.match(meeting, /openInModal/);
  assert.match(meeting, /className="space-y-4"/);
  assert.match(relatedTasks, /<button[\s\S]*setActiveTaskId/);
  assert.doesNotMatch(
    relatedTasks.slice(
      relatedTasks.indexOf("openInModal ?"),
      relatedTasks.indexOf(") : (", relatedTasks.indexOf("openInModal ?")),
    ),
    /href=/,
  );
  assert.match(relatedTasks, /canEdit=\{canEdit\}/);
  assert.match(taskModal, /Oprindelse og relationer/);
  assert.match(taskModal, /TaskComments[\s\S]*?canComment=\{canEdit\}/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /max-h-\[calc\(100dvh/);
  assert.match(focusHook, /event\.key === "Escape"/);
  assert.match(focusHook, /returnTarget\?\.isConnected/);
});

test("task edits keep the original meeting and agenda ids and remain server-authorized", async () => {
  const [taskModal, service] = await Promise.all([
    read("src/components/tasks/task-detail-modal.tsx"),
    read("src/services/task-service.ts"),
  ]);
  assert.match(taskModal, /meetingId: task\.meeting_id/);
  assert.match(taskModal, /agendaItemId: task\.agenda_item_id/);
  assert.match(taskModal, /decisionId: task\.decision_id/);
  const updateMethod = service.slice(
    service.indexOf("async update(input"),
    service.indexOf("async performAction"),
  );
  assert.match(updateMethod, /requireAgendaItemEditor/);
});
