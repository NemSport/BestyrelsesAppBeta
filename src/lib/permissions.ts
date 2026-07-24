import { AuthorizationError } from "@/lib/errors";
import {
  getMeetingCapabilities,
  hasMeetingCapability,
  meetingCapabilityDeniedMessage,
  type CommitteeRole,
  type MeetingCapabilities,
  type MeetingCapability,
  type OrganizationRole,
} from "@/lib/meeting-capabilities";

export {
  getMeetingCapabilities,
  hasMeetingCapability,
  meetingCapabilityDeniedMessage,
};
export type {
  CommitteeRole,
  MeetingCapabilities,
  MeetingCapability,
  OrganizationRole,
};

export function isOrganizationAdmin(role: OrganizationRole) {
  return role === "owner" || role === "admin";
}

export function canManageCommittee(
  organizationRole: OrganizationRole,
  committeeRole: CommitteeRole | null,
) {
  return getMeetingCapabilities(organizationRole, committeeRole).updateMeeting;
}

export function canEditAgendaItems(
  organizationRole: OrganizationRole,
  committeeRole: CommitteeRole | null,
) {
  return getMeetingCapabilities(organizationRole, committeeRole)
    .updateAgendaItem;
}

export function assertMeetingCapability(
  capabilities: MeetingCapabilities,
  capability: MeetingCapability,
) {
  if (!hasMeetingCapability(capabilities, capability)) {
    throw new AuthorizationError(meetingCapabilityDeniedMessage);
  }
}
