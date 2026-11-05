import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Isolate outbound email from these local approval-preparation tests.
require.cache[require.resolve("../../src/services/email-service.ts")] = {
  exports: { EmailService: class {} },
};
const {
  MeetingMinutesService,
} = require("../../src/services/meeting-minutes-service.ts");

const input = {
  organizationId: "org",
  committeeId: "committee",
  meetingId: "meeting",
  userId: "actor",
};
function serviceWith(existing, items) {
  const service = new MeetingMinutesService({});
  const created = [];
  service.minutes = {
    findMeetingMinutes: async () => existing,
    listAgendaItemMinutes: async () => items,
    createMeetingMinutes: async (row) => {
      created.push(row);
      return { id: "new-minutes", ...row };
    },
  };
  return { service, created };
}
test("saved point minutes can create the approval draft without a general minutes record", async () => {
  const { service, created } = serviceWith(null, [
    { notes: "<p>Beslutningen er gemt.</p>", decision: null, follow_up: null },
  ]);
  const result = await service.ensureMeetingMinutesForApproval(input);
  assert.equal(result.status, "draft");
  assert.equal(result.meeting_id, input.meetingId);
  assert.equal(result.organization_id, input.organizationId);
  assert.equal(result.created_by, input.userId);
  assert.equal(created.length, 1);
});
test("empty minutes are still rejected before creating an approval draft", async () => {
  const { service, created } = serviceWith(null, [
    { notes: "<p></p>", decision: null, follow_up: null },
  ]);
  await assert.rejects(
    service.ensureMeetingMinutesForApproval(input),
    /Referatet er tomt/,
  );
  assert.equal(created.length, 0);
});
test("an existing minutes record is reused", async () => {
  const existing = {
    id: "existing",
    minutes_text: "Gemte noter",
    decisions: "",
  };
  const { service, created } = serviceWith(existing, []);
  assert.equal(await service.ensureMeetingMinutesForApproval(input), existing);
  assert.equal(created.length, 0);
});
test("the send control requires permission and recipients, not a pre-existing general minutes record", async () => {
  const source = await readFile(
    new URL(
      "../../src/components/meetings/minutes-governance.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const eligibility = source.match(/const canSendForApproval =([^;]+);/)?.[1];
  assert.ok(eligibility);
  assert.match(eligibility, /canEdit/);
  assert.match(eligibility, /approvalRecipientInfo.eligibleCount > 0/);
  assert.doesNotMatch(eligibility, /Boolean\(minutes\)|minutes\./);
  assert.match(
    source,
    /disabled=\{working \|\| !deadline \|\| !canSendForApproval\}/,
  );
});
