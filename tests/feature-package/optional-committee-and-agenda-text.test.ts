import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  agendaItemInputSchema,
  agendaItemUpdateSchema,
  committeeInputSchema,
  committeeUpdateSchema,
} from "../../src/lib/validation";

const organizationId = randomUUID();
const committeeId = randomUUID();

test("an empty committee description is accepted on create and edit", () => {
  const input = { organizationId, name: "Testudvalg" };
  for (const description of [null, undefined, "", "  "]) {
    assert.equal(committeeInputSchema.parse({ ...input, description }).description, "");
    assert.equal(
      committeeUpdateSchema.parse({ ...input, committeeId, description }).description,
      "",
    );
  }
  assert.equal(committeeInputSchema.parse({ ...input, description: " Tekst " }).description, "Tekst");
  assert.equal(committeeInputSchema.safeParse({ ...input, description: "a".repeat(2001) }).success, false);
});

test("agenda items can omit or clear both optional text fields", () => {
  const input = { organizationId, committeeId, title: "Testpunkt", itemType: "discussion" };
  for (const value of [null, undefined, "", "  "]) {
    const fields = { ...input, objective: value, description: value };
    for (const parsed of [
      agendaItemInputSchema.parse({ ...fields, meetingId: randomUUID() }),
      agendaItemInputSchema.parse({ ...fields, targetDate: "2026-11-20" }),
      agendaItemUpdateSchema.parse({ ...fields, agendaItemId: randomUUID() }),
    ]) {
      assert.equal(parsed.objective, "");
      assert.equal(parsed.description, "");
    }
  }
  assert.equal(agendaItemInputSchema.safeParse(input).success, false);
  const parsed = agendaItemInputSchema.parse({
    ...input,
    meetingId: randomUUID(),
    objective: " Formål ",
    description: " Baggrund ",
  });
  assert.equal(parsed.objective, "Formål");
  assert.equal(parsed.description, "Baggrund");
});
