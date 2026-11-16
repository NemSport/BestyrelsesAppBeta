import assert from "node:assert/strict";
import { test } from "node:test";
import { explicitBestieFollowUpDate, explicitBestieFollowUpTime } from "../../src/lib/bestie-follow-up-date";

test("reads a concrete follow-up date from the same message as a status update", () => {
  const today = "2026-11-13";
  for (const date of ["27. november", "27.11", "2026-11-27", "om 14 dage", "om 2 uger"]) {
    assert.equal(
      explicitBestieFollowUpDate(`Han er kontaktet. Følg op ${date}.`, today),
      "2026-11-27",
    );
  }
  assert.equal(explicitBestieFollowUpDate("Følg op den 2. januar.", today), "2027-01-02");
});

test("leaves negated, invalid and alternative requests to the conversation", () => {
  const today = "2026-11-13";
  for (const reply of [
    "Du skal ikke følge op den 27. november.",
    "Følg op den 31. november.",
    "Følg op den 27. eller 28. november.",
    "Peter skrev: Følg op den 27. november.",
  ]) {
    assert.equal(explicitBestieFollowUpDate(reply, today), null);
  }
});

test("resolves Danish local reminder times, including short replies and weekdays", () => {
  const now = new Date("2026-11-16T17:00:00Z");
  assert.equal(explicitBestieFollowUpTime("i morgen kl. 12", now).at, "2026-11-17T11:00:00.000Z");
  assert.equal(explicitBestieFollowUpTime("Set reminder på torsdag klokken 12:30", now).at, "2026-11-19T11:30:00.000Z");
  assert.deepEqual(explicitBestieFollowUpTime("Det går ok. Det reminder i morgen klokken 12", now), {
    at: "2026-11-17T11:00:00.000Z", needsClarification: false, precedingText: "Det går ok.",
  });
  assert.equal(explicitBestieFollowUpTime("Mind mig om 2 minutter", now).at, "2026-11-16T17:02:00.000Z");
  assert.equal(explicitBestieFollowUpTime("Mind mig kl. 12", now).needsClarification, true);
  assert.equal(explicitBestieFollowUpTime("Mind mig i morgen kl. 25", now).needsClarification, true);
  assert.equal(explicitBestieFollowUpTime("i morgen kl. 12 eller kl. 13", now).at, null);
});

test("uses summer time and asks about skipped or repeated local clock times", () => {
  assert.equal(explicitBestieFollowUpTime("i morgen kl. 12", new Date("2026-06-16T08:00:00Z")).at, "2026-06-17T10:00:00.000Z");
  for (const now of ["2026-03-28T08:00:00Z", "2026-10-24T08:00:00Z"]) {
    assert.equal(explicitBestieFollowUpTime("i morgen kl. 02.30", new Date(now)).needsClarification, true);
  }
});
