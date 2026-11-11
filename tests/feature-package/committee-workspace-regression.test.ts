import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

import { AnnualWheelRepository } from "../../src/repositories/annual-wheel-repository";
import { TaskRepository } from "../../src/repositories/task-repository";
import type { Database } from "../../src/types/database";

const organizationId = "10000000-0000-4000-8000-000000000001";
const committeeId = "20000000-0000-4000-8000-000000000001";
const eventId = "30000000-0000-4000-8000-000000000001";

function fixtureClient(fetch: typeof globalThis.fetch) {
  return createClient<Database>("https://workspace.example.test", "test-key", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch },
  });
}

test("deadline totals count all open committee tasks independently of the preview limit", async () => {
  const deadlineQueries = new Map<string, string[]>();
  const db = fixtureClient(async (input, init) => {
    const query = new URL(String(input)).searchParams;
    assert.equal(query.get("organization_id"), `eq.${organizationId}`);
    assert.equal(query.get("committee_id"), `eq.${committeeId}`);
    assert.equal(query.get("archived_at"), "is.null");
    assert.equal(query.get("status"), "not.in.(completed,cancelled)");

    if (init?.method === "HEAD") {
      assert.equal(new Headers(init.headers).get("prefer"), "count=exact");
      assert.equal(query.get("limit"), null);
      const deadlines = query.getAll("deadline");
      deadlineQueries.set(deadlines[0], deadlines);
      const total = deadlines[0].startsWith("lt.") ? 19 : 2;
      return new Response(null, {
        headers: { "Content-Range": `0-${total - 1}/${total}` },
      });
    }

    assert.equal(query.get("limit"), "12");
    return Response.json(
      Array.from({ length: 12 }, (_, index) => ({ id: index })),
    );
  });

  const tasks = new TaskRepository(db);
  const [preview, totals] = await Promise.all([
    tasks.listWorkspaceOpen(organizationId, committeeId),
    tasks.countWorkspaceDeadlines(
      organizationId,
      committeeId,
      "2026-11-11",
      "2026-11-18",
    ),
  ]);

  assert.equal(preview.length, 12);
  assert.deepEqual(totals, { overdueCount: 19, dueSoonCount: 2 });
  assert.deepEqual(deadlineQueries.get("lt.2026-11-11"), ["lt.2026-11-11"]);
  assert.deepEqual(deadlineQueries.get("gte.2026-11-11"), [
    "gte.2026-11-11",
    "lte.2026-11-18",
  ]);
});

test("an activity link resolves a later year only inside its organization and committee", async () => {
  const db = fixtureClient(async (input) => {
    const query = new URL(String(input)).searchParams;
    assert.equal(query.get("select"), "starts_on");
    assert.equal(query.get("organization_id"), `eq.${organizationId}`);
    assert.equal(query.get("id"), `eq.${eventId}`);
    assert.equal(query.get("deleted_at"), "is.null");
    return Response.json(
      query.get("committee_id") === `eq.${committeeId}`
        ? [{ starts_on: "2027-02-01" }]
        : [],
    );
  });

  const activities = new AnnualWheelRepository(db);
  assert.equal(
    await activities.findCommitteeActivityStartDate(
      organizationId,
      committeeId,
      eventId,
    ),
    "2027-02-01",
  );
  assert.equal(
    await activities.findCommitteeActivityStartDate(
      organizationId,
      "20000000-0000-4000-8000-000000000002",
      eventId,
    ),
    null,
  );
});
