import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveMeetingParticipantRecipients,
  resolveSelectedMeetingMaterialRecipients,
  tasksForRecipient,
} from "../../src/lib/meeting-material-dispatch";

const committeeId = "committee-a";

function member({
  id,
  name,
  email,
  status = "active",
  committees = [committeeId],
}: {
  id: string;
  name: string;
  email: string | null;
  status?: string;
  committees?: string[];
}) {
  return {
    user_id: id,
    full_name: name,
    email,
    status,
    committees: committees.map((id) => ({ id })),
  };
}

test("internal meeting participant resolves canonical member email", () => {
  const result = resolveMeetingParticipantRecipients({
    committeeId,
    members: [member({ id: "mathias", name: "Mathias", email: "mathias@example.dk" })],
    internalParticipants: [
      { user_id: "mathias", attendance_status: "accepted" },
    ],
    externalParticipants: [],
  });

  assert.equal(result.totalParticipantCount, 1);
  assert.equal(result.participantsWithEmailCount, 1);
  assert.equal(result.recipients[0]?.email, "mathias@example.dk");
  assert.equal(result.recipients[0]?.userId, "mathias");
  assert.deepEqual(result.unavailableParticipants, []);
});

test("internal participant without member email is visible but not sendable", () => {
  const result = resolveMeetingParticipantRecipients({
    committeeId,
    members: [member({ id: "louise", name: "Louise", email: "" })],
    internalParticipants: [
      { user_id: "louise", attendance_status: "attended" },
    ],
    externalParticipants: [],
  });

  assert.equal(result.totalParticipantCount, 1);
  assert.equal(result.participantsWithEmailCount, 0);
  assert.deepEqual(result.recipients, []);
  assert.deepEqual(result.unavailableParticipants, [
    { key: "member:louise", name: "Louise", reason: "missing_email" },
  ]);
});

test("external participant uses the email stored on the external attendee", () => {
  const result = resolveMeetingParticipantRecipients({
    committeeId,
    members: [],
    internalParticipants: [],
    externalParticipants: [
      { id: "external-1", name: "Ekstern Eva", email: "eva@example.dk" },
    ],
  });

  assert.equal(result.totalParticipantCount, 1);
  assert.equal(result.participantsWithEmailCount, 1);
  assert.deepEqual(result.recipients[0], {
    kind: "external",
    userId: null,
    name: "Ekstern Eva",
    email: "eva@example.dk",
  });
});

test("mixed participant set reports four of five with email", () => {
  const members = [
    member({ id: "one", name: "En", email: "one@example.dk" }),
    member({ id: "two", name: "To", email: "two@example.dk" }),
    member({ id: "three", name: "Tre", email: "three@example.dk" }),
    member({ id: "four", name: "Fire", email: null }),
  ];
  const result = resolveMeetingParticipantRecipients({
    committeeId,
    members,
    internalParticipants: members.map((candidate) => ({
      user_id: candidate.user_id,
      attendance_status: "accepted",
    })),
    externalParticipants: [
      { id: "external-1", name: "Fem", email: "five@example.dk" },
    ],
  });

  assert.equal(result.totalParticipantCount, 5);
  assert.equal(result.participantsWithEmailCount, 4);
  assert.equal(result.recipients.length, 4);
  assert.equal(result.unavailableParticipants[0]?.name, "Fire");
});

test("meeting without registrations reuses active committee-member fallback", () => {
  const result = resolveMeetingParticipantRecipients({
    committeeId,
    members: [
      member({ id: "one", name: "En", email: "one@example.dk" }),
      member({ id: "other", name: "Anden", email: "other@example.dk", committees: ["committee-b"] }),
      member({ id: "inactive", name: "Inaktiv", email: "inactive@example.dk", status: "inactive" }),
    ],
    internalParticipants: [],
    externalParticipants: [],
  });

  assert.equal(result.usedCommitteeFallback, true);
  assert.equal(result.totalParticipantCount, 1);
  assert.equal(result.participantsWithEmailCount, 1);
  assert.deepEqual(result.recipients.map((recipient) => recipient.userId), ["one"]);
});

test("selected organization recipients keep canonical active-member resolution", () => {
  const result = resolveSelectedMeetingMaterialRecipients({
    members: [
      member({ id: "selected", name: "Valgt", email: "selected@example.dk" }),
      member({ id: "inactive", name: "Inaktiv", email: "inactive@example.dk", status: "inactive" }),
    ],
    selectedUserIds: ["selected"],
  });

  assert.deepEqual(result.invalidUserIds, []);
  assert.deepEqual(result.recipients[0], {
    kind: "member",
    userId: "selected",
    name: "Valgt",
    email: "selected@example.dk",
  });
});

test("personal task mapping remains tied to recipient user id", () => {
  const tasks = [
    { id: "one", responsible_user_id: "selected" },
    { id: "two", responsible_user_id: "other" },
  ];
  const recipient = resolveSelectedMeetingMaterialRecipients({
    members: [
      member({ id: "selected", name: "Valgt", email: "selected@example.dk" }),
    ],
    selectedUserIds: ["selected"],
  }).recipients[0]!;

  assert.deepEqual(
    tasksForRecipient(tasks, recipient.userId).map((task) => task.id),
    ["one"],
  );
});
