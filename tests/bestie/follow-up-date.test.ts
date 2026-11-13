import assert from "node:assert/strict";
import { test } from "node:test";
import { explicitBestieFollowUpDate } from "../../src/lib/bestie-follow-up-date";

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
