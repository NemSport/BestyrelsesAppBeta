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
  assert.equal(viewer.createQuickMeeting, false);
  assert.equal(viewer.updateMeeting, false);
  assert.equal(viewer.deleteMeeting, false);
  assert.equal(viewer.manageParticipants, false);
  assert.equal(viewer.editOfficialMinutes, false);
  assert.equal(viewer.createAgendaItem, false);
  assert.equal(viewer.updateAgendaItem, false);
  assert.equal(viewer.scheduleAgendaItem, false);
  assert.equal(viewer.editTasks, false);
  assert.equal(viewer.editDecisions, false);

  const member = getMeetingCapabilities("member", "member");
  assert.equal(member.viewMeeting, true);
  assert.equal(member.createMeeting, false);
  assert.equal(member.createQuickMeeting, false);
  assert.equal(member.updateMeeting, false);
  assert.equal(member.deleteMeeting, false);
  assert.equal(member.manageParticipants, false);
  assert.equal(member.scheduleAgendaItem, false);
  assert.equal(member.reorderAgendaItems, false);
  assert.equal(member.deleteAgendaItem, false);
  assert.equal(member.editOfficialMinutes, false);
  assert.equal(member.manageMinutesApproval, false);
  assert.equal(member.createAgendaItem, true);
  assert.equal(member.updateAgendaItem, true);
  assert.equal(member.editNotes, true);
  assert.equal(member.editTasks, true);
  assert.equal(member.editDecisions, true);

  const manager = getMeetingCapabilities("member", "chair");
  assert.equal(manager.createMeeting, true);
  assert.equal(manager.createQuickMeeting, true);
  assert.equal(manager.updateMeeting, true);
  assert.equal(manager.deleteMeeting, true);
  assert.equal(manager.manageParticipants, true);
  assert.equal(manager.scheduleAgendaItem, true);
  assert.equal(manager.reorderAgendaItems, true);
  assert.equal(manager.deleteAgendaItem, true);
  assert.equal(manager.editOfficialMinutes, true);
  assert.equal(manager.manageMinutesApproval, true);
  assert.equal(manager.manageMinutesAttachments, true);
  assert.equal(manager.manageTransferredAgendaItems, true);
  assert.equal(manager.sendAgendaEmail, true);
  assert.equal(manager.editTasks, true);
  assert.equal(manager.editDecisions, true);
});

test("shared capability decisions cover server authorization inputs", () => {
  const viewer = getMeetingCapabilities("viewer", "viewer");
  const member = getMeetingCapabilities("member", "member");
  const manager = getMeetingCapabilities("member", "secretary");

  assert.equal(hasMeetingCapability(viewer, "createMeeting"), false);
  assert.equal(hasMeetingCapability(member, "manageParticipants"), false);
  assert.equal(hasMeetingCapability(manager, "editOfficialMinutes"), true);
  assert.equal(hasMeetingCapability(manager, "manageMinutesApproval"), true);
  assert.equal(hasMeetingCapability(member, "editTasks"), true);
  assert.equal(hasMeetingCapability(member, "editDecisions"), true);
  assert.match(meetingCapabilityDeniedMessage, /Kontakt en ansvarlig/);
  assert.doesNotMatch(meetingCapabilityDeniedMessage, /chair|secretary|member/);
});

test("organization admins and owners retain committee-manager capabilities", () => {
  const admin = getMeetingCapabilities("admin", null);
  const owner = getMeetingCapabilities("owner", null);
  assert.equal(admin.createMeeting, true);
  assert.equal(admin.createQuickMeeting, true);
  assert.equal(admin.manageParticipants, true);
  assert.equal(admin.scheduleAgendaItem, true);
  assert.equal(admin.editOfficialMinutes, true);
  assert.deepEqual(owner, admin);
});

test("organization membership alone does not grant committee access", () => {
  const memberWithoutCommittee = getMeetingCapabilities("member", null);
  const viewerWithoutCommittee = getMeetingCapabilities("viewer", null);

  assert.equal(memberWithoutCommittee.viewMeeting, false);
  assert.equal(memberWithoutCommittee.createAgendaItem, false);
  assert.equal(viewerWithoutCommittee.viewMeeting, false);
});
