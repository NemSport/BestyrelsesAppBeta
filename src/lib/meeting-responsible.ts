import { getMeetingCapabilities } from "@/lib/meeting-capabilities";
import type { OrganizationMemberDirectoryEntry } from "@/types/domain";

export function meetingResponsibleOptions(
  members: OrganizationMemberDirectoryEntry[],
  committeeId: string,
) {
  return members
    .filter(
      (member) =>
        member.status === "active" &&
        getMeetingCapabilities(
          member.role,
          member.committees.find(({ id }) => id === committeeId)?.role ?? null,
        ).scheduleAgendaItem,
    )
    .map(({ user_id, full_name, email }) => ({
      value: user_id,
      label: full_name || email,
    }));
}
