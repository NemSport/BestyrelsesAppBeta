import type { Database } from "@/types/database";

type OrganizationRole = Database["public"]["Enums"]["organization_role"];

export function canManageOrganizationTrash(role: OrganizationRole) {
  return role === "owner" || role === "admin";
}
