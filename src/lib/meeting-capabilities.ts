export type OrganizationRole = "owner" | "admin" | "member" | "viewer";
export type CommitteeRole = "chair" | "secretary" | "member" | "viewer";

export type MeetingCapabilities = {
  viewMeeting: boolean;
  createMeeting: boolean;
  createQuickMeeting: boolean;
  updateMeeting: boolean;
  deleteMeeting: boolean;
  restoreMeeting: boolean;
  manageParticipants: boolean;
  createAgendaItem: boolean;
  updateAgendaItem: boolean;
  scheduleAgendaItem: boolean;
  reorderAgendaItems: boolean;
  deleteAgendaItem: boolean;
  restoreAgendaItem: boolean;
  editNotes: boolean;
  editOfficialMinutes: boolean;
  manageMinutesApproval: boolean;
  manageMinutesAttachments: boolean;
  uploadMinutesAttachments: boolean;
  manageTransferredAgendaItems: boolean;
  sendAgendaEmail: boolean;
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
  const organizationAdmin =
    organizationRole === "owner" || organizationRole === "admin";
  const editor = manager || committeeRole === "member";

  return {
    viewMeeting:
      manager || committeeRole === "member" || committeeRole === "viewer",
    createMeeting: manager,
    createQuickMeeting: manager,
    updateMeeting: manager,
    deleteMeeting: manager,
    restoreMeeting: organizationAdmin,
    manageParticipants: manager,
    createAgendaItem: editor,
    updateAgendaItem: editor,
    scheduleAgendaItem: manager,
    reorderAgendaItems: manager,
    deleteAgendaItem: manager,
    restoreAgendaItem: organizationAdmin,
    editNotes: editor,
    editOfficialMinutes: manager,
    manageMinutesApproval: manager,
    manageMinutesAttachments: manager,
    uploadMinutesAttachments: editor,
    manageTransferredAgendaItems: manager,
    sendAgendaEmail: manager,
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
