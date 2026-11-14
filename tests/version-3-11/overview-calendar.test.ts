import assert from "node:assert/strict";
import { test } from "node:test";

import { overviewMonth } from "../../src/lib/overview-calendar";

test("the calendar defaults to the Copenhagen month and includes its UTC boundary", () => {
  const month = overviewMonth(undefined, new Date("2026-10-31T23:30:00Z"));
  assert.equal(month.today, "2026-11-01");
  assert.equal(month.first, "2026-11-01");
  assert.equal(month.leading, 6);
  assert.equal(month.queryStart, "2026-10-31T00:00:00.000Z");
  assert.equal(month.next, "2026-12");
});

test("February in a leap year has 29 days and invalid months use today", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  assert.equal(overviewMonth("2028-02", now).last, "2028-02-29");
  assert.equal(overviewMonth("2026-13", now).first, "2026-11-01");
});
