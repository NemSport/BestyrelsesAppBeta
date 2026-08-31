import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sortAgendaItemHistory } from "../../src/lib/agenda-item-history.ts";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [migration, repository, service, databaseTypes] = await Promise.all([
  source(
    "../../supabase/migrations/202608090001_agenda_item_history_threads.sql",
  ),
  source("../../src/repositories/agenda-item-repository.ts"),
  source("../../src/services/agenda-item-service.ts"),
  source("../../src/types/database.ts"),
]);

test("new agenda items receive a stable thread without title matching", () => {
  assert.match(
    migration,
    /alter column agenda_item_thread_id set default gen_random_uuid\(\)/,
  );
  assert.match(migration, /alter column agenda_item_thread_id set not null/);
  assert.match(databaseTypes, /agenda_item_thread_id: string/);
  assert.doesNotMatch(migration, /lower\([^)]*title|similarity\(|levenshtein/i);
});

test("explicit transfers inherit the source thread and ambiguous items stay separate", () => {
  assert.match(migration, /set agenda_item_thread_id = id/);
  assert.match(migration, /parent\.id = child\.parent_id/);
  assert.match(migration, /transfer\.source_agenda_item_id/);
  assert.match(migration, /transfer\.target_agenda_item_id/);
  assert.match(migration, /where transfer\.status = 'scheduled'/);
  assert.match(
    migration,
    /new\.agenda_item_thread_id := parent_item\.agenda_item_thread_id/,
  );
  assert.match(migration, /historikreference kan ikke [^']+ndres/);
});

test("thread scope is indexed and protected across organization and committee", () => {
  assert.match(migration, /create index agenda_items_thread_history_idx/);
  assert.match(
    migration,
    /agenda_item_thread_id,[\s\S]*organization_id,[\s\S]*committee_id/,
  );
  assert.match(
    migration,
    /historikreference krydser organisation eller udvalg/,
  );
  assert.doesNotMatch(migration, /create policy|service_role/i);
});

test("history entries are returned oldest first even when titles change", () => {
  const entries = sortAgendaItemHistory([
    {
      id: "item-b",
      occurrenceId: "occurrence-b",
      threadId: "thread-1",
      meetingId: "meeting-b",
      meetingTitle: "Majmøde",
      meetingDate: "2026-05-20T17:00:00Z",
      agendaItemNumber: 2,
      title: "Valg af entreprenør",
      type: "decision",
      status: "planned",
      decisions: [],
      openTaskCount: 0,
      createdAt: "2026-05-01T00:00:00Z",
    },
    {
      id: "item-a",
      occurrenceId: "occurrence-a",
      threadId: "thread-1",
      meetingId: "meeting-a",
      meetingTitle: "Martsmøde",
      meetingDate: "2026-03-12T17:00:00Z",
      agendaItemNumber: 4,
      title: "Renovering af klubhus",
      type: "discussion",
      status: "completed",
      decisions: [],
      openTaskCount: 0,
      createdAt: "2026-03-01T00:00:00Z",
    },
  ]);

  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["item-a", "item-b"],
  );
  assert.equal(entries.every((entry) => entry.threadId === "thread-1"), true);
});

test("repository loads the full thread without N+1 and keeps RLS scope", () => {
  assert.match(repository, /async getAgendaItemHistory/);
  assert.match(repository, /\.eq\("agenda_item_thread_id"/);
  assert.match(repository, /\.eq\("organization_id", input\.organizationId\)/);
  assert.match(repository, /\.eq\("committee_id", input\.committeeId\)/);
  assert.match(
    repository,
    /agenda_item_occurrences!inner\([^)]*meetings!inner\(/,
  );
  assert.match(repository, /occurrence\.meetings !== null/);
  assert.match(repository, /sortAgendaItemHistory\(entries\)/);
  assert.doesNotMatch(repository, /service_role/i);
});

test("service authenticates and authorizes history reads before repository access", () => {
  const historyMethod = service.match(
    /async getAgendaItemHistory[\s\S]*?\n  async create/,
  )?.[0];
  assert.ok(historyMethod);
  assert.match(historyMethod, /this\.auth\.requireUser\(\)/);
  assert.match(historyMethod, /requireCommitteeMember/);
  assert.match(historyMethod, /this\.agendaItems\.getAgendaItemHistory/);
});
