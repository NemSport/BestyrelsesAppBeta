import type { TaskStakeholderContractOption } from "@/types/domain";

export function reconcileTaskStakeholderContract(
  stakeholderId: string,
  stakeholderContractId: string,
  contracts: TaskStakeholderContractOption[],
) {
  if (!stakeholderId || !stakeholderContractId) return "";

  return contracts.some(
    (contract) =>
      contract.id === stakeholderContractId &&
      contract.stakeholder_id === stakeholderId,
  )
    ? stakeholderContractId
    : "";
}
