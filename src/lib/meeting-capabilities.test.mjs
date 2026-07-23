import assert from "node:assert/strict";
import test from "node:test";

import {
  getMeetingCapabilities,
  hasMeetingCapability,
  meetingCapabilityDeniedMessage,
} from "./meeting-capabilities.ts";

test("client model distinguishes viewer, member, and committee manager", () => {
  const viewer = getMeetingCapabilities("viewer", "viewer");
  assert.equal(viewer.viewMeeting, true);
  assert.equal(viewer.createMeeting, false);
  assert.equal(viewer.manageParticipants, false);
  assert.equal(viewer.editOfficialMinutes, false);
  assert.equal(viewer.editTasks, false);
  assert.equal(viewer.editDecisions, false);

  const member = getMeetingCapabilities("member", "member");
  assert.equal(member.viewMeeting, true);
  assert.equal(member.createMeeting, false);
  assert.equal(member.manageParticipants, false);
  assert.equal(member.manageAgenda, false);
  assert.equal(member.editOfficialMinutes, false);
  assert.equal(member.editAgendaItems, true);
  assert.equal(member.editTasks, true);
  assert.equal(member.editDecisions, true);

  const manager = getMeetingCapabilities("member", "chair");
  assert.equal(manager.createMeeting, true);
  assert.equal(manager.manageParticipants, true);
  assert.equal(manager.manageAgenda, true);
  assert.equal(manager.editOfficialMinutes, true);
  assert.equal(manager.manageMinutesApproval, true);
  assert.equal(manager.editTasks, true);
  assert.equal(manager.editDecisions, true);
});

test("server authorization consumes the same capability decisions", () => {
  const viewer = getMeetingCapabilities("viewer", "viewer");
  const member = getMeetingCapabilities("member", "member");
  const manager = getMeetingCapabilities("member", "secretary");

  assert.equal(hasMeetingCapability(viewer, "createMeeting"), false);
  assert.equal(hasMeetingCapability(member, "manageParticipants"), false);
  assert.equal(hasMeetingCapability(manager, "editOfficialMinutes"), true);
  assert.equal(hasMeetingCapability(member, "editTasks"), true);
  assert.equal(hasMeetingCapability(member, "editDecisions"), true);
  assert.match(meetingCapabilityDeniedMessage, /Kontakt en ansvarlig/);
  assert.doesNotMatch(meetingCapabilityDeniedMessage, /chair|secretary|member/);
});

test("organization admins retain committee-manager capabilities", () => {
  const admin = getMeetingCapabilities("admin", null);
  assert.equal(admin.createMeeting, true);
  assert.equal(admin.manageParticipants, true);
  assert.equal(admin.manageAgenda, true);
  assert.equal(admin.editOfficialMinutes, true);
});
