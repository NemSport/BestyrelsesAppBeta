import type { Database } from "@/types/database";
import type { StakeholderCapabilities } from "@/types/stakeholders";

export function getStakeholderCapabilities(
  role: Database["public"]["Enums"]["organization_role"],
): StakeholderCapabilities {
  const canWork = role === "owner" || role === "admin" || role === "member";
  return {
    viewStakeholders: true,
    createStakeholders: canWork,
    updateStakeholders: canWork,
    archiveStakeholders: role === "owner" || role === "admin",
    manageContacts: canWork,
    manageContracts: canWork,
    managePipeline: canWork,
    addActivities: canWork,
  };
}
