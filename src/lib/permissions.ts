import type { Database } from "@/types/database";

type OrganizationRole = Database["public"]["Enums"]["organization_role"];
type CommitteeRole = Database["public"]["Enums"]["committee_role"];

export function isOrganizationAdmin(role: OrganizationRole) {
  return role === "owner" || role === "admin";
}

export function canManageCommittee(
  organizationRole: OrganizationRole,
  committeeRole: CommitteeRole | null,
) {
  return (
    isOrganizationAdmin(organizationRole) ||
    committeeRole === "chair" ||
    committeeRole === "secretary"
  );
}

export function canEditAgendaItems(
  organizationRole: OrganizationRole,
  committeeRole: CommitteeRole | null,
) {
  return (
    isOrganizationAdmin(organizationRole) ||
    committeeRole === "chair" ||
    committeeRole === "secretary" ||
    committeeRole === "member"
  );
}
