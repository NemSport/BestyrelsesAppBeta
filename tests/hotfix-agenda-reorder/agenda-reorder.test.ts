import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { hasContiguousAgendaPositions } from "../../src/lib/agenda-reorder";

const root = process.cwd();
const source = (path: string) => readFileSync(`${root}/${path}`, "utf8");

test("recognizes healthy, gapped and unordered agenda positions", () => {
  assert.equal(
    hasContiguousAgendaPositions(
      Array.from({ length: 10 }, (_, position) => ({ position })),
    ),
    true,
  );
  assert.equal(
    hasContiguousAgendaPositions(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 10].map((position) => ({ position })),
    ),
    false,
  );
  assert.equal(
    hasContiguousAgendaPositions(
      [9, 0, 8, 1, 7, 2, 6, 3, 5, 4].map((position) => ({ position })),
    ),
    true,
  );
});

test("normalizes only damaged position sets before the atomic batch reorder", () => {
  const service = source("src/services/agenda-item-service.ts");
  const repository = source("src/repositories/agenda-item-repository.ts");
  const migration = source(
    "supabase/migrations/202606270004_batch_reorder_agenda_item_occurrences.sql",
  );

  assert.match(service, /hasContiguousAgendaPositions\(activeOccurrences\)/);
  assert.match(service, /normalizeMeetingOccurrencePositions/);
  assert.match(service, /reorderMeetingOccurrences/);
  assert.ok(
    service.indexOf("normalizeMeetingOccurrencePositions") <
      service.lastIndexOf("reorderMeetingOccurrences"),
  );
  assert.match(repository, /normalize_agenda_item_occurrence_positions/);
  assert.match(repository, /reorder_agenda_item_occurrences/);
  assert.match(migration, /position = position \+ 1000000/);
  assert.match(migration, /provided_count <> active_count/);
  assert.match(migration, /aio\.meeting_id = target_meeting_id/);
});

test("authorization and complete same-meeting validation remain in front of reorder", () => {
  const service = source("src/services/agenda-item-service.ts");

  assert.match(service, /"reorderAgendaItems"/);
  assert.match(service, /meeting\.organization_id !== parsed\.organizationId/);
  assert.match(service, /meeting\.committee_id !== parsed\.committeeId/);
  assert.match(service, /activeOccurrenceIds\.size !== parsed\.occurrenceIds\.length/);
  assert.match(service, /!activeOccurrenceIds\.has\(occurrenceId\)/);
  assert.match(service, /INVALID_AGENDA_ORDER/);
});
