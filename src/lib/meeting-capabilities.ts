export type OrganizationRole = "owner" | "admin" | "member" | "viewer";
export type CommitteeRole = "chair" | "secretary" | "member" | "viewer";

export type MeetingCapabilities = {
  viewMeeting: boolean;
  createMeeting: boolean;
  editMeeting: boolean;
  manageParticipants: boolean;
  manageAgenda: boolean;
  editOfficialMinutes: boolean;
  manageMinutesApproval: boolean;
  editAgendaItems: boolean;
  editTasks: boolean;
  editDecisions: boolean;
};

export type MeetingCapability = keyof MeetingCapabilities;

export const meetingCapabilityDeniedMessage =
  "Handlingen er ikke tilgængelig for dig. Kontakt en ansvarlig for udvalget, hvis den skal udføres.";

export function getMeetingCapabilities(
  organizationRole: OrganizationRole,
  committeeRole: CommitteeRole | null,
): MeetingCapabilities {
  const manager =
    organizationRole === "owner" ||
    organizationRole === "admin" ||
    committeeRole === "chair" ||
    committeeRole === "secretary";
  const editor = manager || committeeRole === "member";

  return {
    viewMeeting:
      manager || committeeRole === "member" || committeeRole === "viewer",
    createMeeting: manager,
    editMeeting: manager,
    manageParticipants: manager,
    manageAgenda: manager,
    editOfficialMinutes: manager,
    manageMinutesApproval: manager,
    editAgendaItems: editor,
    editTasks: editor,
    editDecisions: editor,
  };
}

export function hasMeetingCapability(
  capabilities: MeetingCapabilities,
  capability: MeetingCapability,
) {
  return capabilities[capability];
}
