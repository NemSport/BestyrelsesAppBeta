import type { Database } from "@/types/database";

export type OrganizationRole = Database["public"]["Enums"]["organization_role"];

export const organizationRoles: OrganizationRole[] = [
  "owner",
  "admin",
  "member",
  "viewer",
];

export const nonOwnerOrganizationRoles: OrganizationRole[] = [
  "admin",
  "member",
  "viewer",
];

export function getMemberAccessCapabilities({
  actorRole,
  actorUserId,
  targetRole,
  targetUserId,
  activeOwnerCount,
}: {
  actorRole: OrganizationRole;
  actorUserId: string;
  targetRole: OrganizationRole;
  targetUserId: string;
  activeOwnerCount?: number;
}) {
  const actorIsOwner = actorRole === "owner";
  const actorIsAdmin = actorRole === "admin";
  const targetIsOwner = targetRole === "owner";
  const targetIsSelf = actorUserId === targetUserId;
  const canManageMembers = actorIsOwner || actorIsAdmin;
  const ownerProtectedFromAdmin = actorIsAdmin && targetIsOwner;
  const selfProtectedFromAdmin = actorIsAdmin && targetIsSelf;
  const lastOwnerProtected =
    targetIsOwner && activeOwnerCount !== undefined && activeOwnerCount <= 1;

  return {
    canManageMembers,
    canEditAccess:
      canManageMembers && !ownerProtectedFromAdmin && !selfProtectedFromAdmin,
    canRemove:
      canManageMembers &&
      (actorIsOwner || !targetIsOwner) &&
      !lastOwnerProtected,
    assignableOrganizationRoles: actorIsOwner
      ? lastOwnerProtected
        ? organizationRoles.filter((role) => role === "owner")
        : organizationRoles
      : nonOwnerOrganizationRoles,
    lastOwnerProtected,
    ownerProtectedFromAdmin,
    selfProtectedFromAdmin,
  };
}

const organizationRoleAccessWeight: Record<OrganizationRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

const committeeRoleAccessWeight: Record<
  Database["public"]["Enums"]["committee_role"],
  number
> = {
  chair: 4,
  secretary: 3,
  member: 2,
  viewer: 1,
};

export function isOrganizationRoleReduction(
  before: OrganizationRole,
  after: OrganizationRole,
) {
  return (
    organizationRoleAccessWeight[after] < organizationRoleAccessWeight[before]
  );
}

export function isCommitteeRoleReduction(
  before: Database["public"]["Enums"]["committee_role"],
  after: Database["public"]["Enums"]["committee_role"],
) {
  return committeeRoleAccessWeight[after] < committeeRoleAccessWeight[before];
}
