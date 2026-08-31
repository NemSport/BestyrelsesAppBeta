import type {
  Stakeholder,
  StakeholderContract,
  StakeholderKpis,
  StakeholderListItem,
  StakeholderPipelineEntry,
  StakeholderPipelineStage,
  StakeholderType,
  StakeholderRelationshipStatus,
} from "@/types/stakeholders";

export const stakeholderContractExpiryDays = 90;
export const stakeholderActionDays = 30;
export const stakeholderFollowUpDays = 7;

export const stakeholderTypeLabels: Record<StakeholderType, string> = {
  sponsor: "Sponsor",
  supplier: "Leverandør",
  partner: "Samarbejdspartner",
  other: "Anden",
};

export const stakeholderStatusLabels: Record<
  StakeholderRelationshipStatus,
  string
> = {
  lead: "Lead",
  active: "Aktiv",
  inactive: "Inaktiv",
  ended: "Afsluttet",
};

export const stakeholderPipelineStages: StakeholderPipelineStage[] = [
  "lead",
  "contacted",
  "dialogue",
  "proposal_sent",
  "won",
  "lost",
];

export const stakeholderPipelineStageLabels: Record<
  StakeholderPipelineStage,
  string
> = {
  lead: "Lead",
  contacted: "Kontaktet",
  dialogue: "Dialog",
  proposal_sent: "Tilbud sendt",
  won: "Aftale",
  lost: "Tabt",
};

export const stakeholderActivityLabels = {
  note: "Note",
  phone_call: "Telefonopkald",
  email: "Email",
  meeting: "Møde",
  follow_up: "Opfølgning",
  contract_event: "Kontrakthændelse",
  pipeline_change: "Pipeline ændret",
} as const;

export function localDate(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

export function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

export function formatStakeholderCurrency(value: number, currency = "DKK") {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function activeContractFor(
  contracts: StakeholderContract[],
  stakeholderId: string,
) {
  return (
    contracts
      .filter(
        (contract) =>
          contract.stakeholder_id === stakeholderId &&
          contract.status === "active" &&
          !contract.archived_at,
      )
      .sort((left, right) =>
        (right.start_date ?? "").localeCompare(left.start_date ?? ""),
      )[0] ?? null
  );
}

export function calculateStakeholderKpis(input: {
  stakeholders: Stakeholder[];
  contracts: StakeholderContract[];
  pipelineEntries: StakeholderPipelineEntry[];
  items: StakeholderListItem[];
  now: Date;
}): StakeholderKpis {
  const today = localDate(input.now);
  const throughExpiry = localDate(
    addDays(input.now, stakeholderContractExpiryDays),
  );
  const activeContracts = input.contracts.filter(
    (contract) => contract.status === "active" && !contract.archived_at,
  );

  return {
    activeSponsors: input.stakeholders.filter(
      (stakeholder) =>
        stakeholder.stakeholder_type === "sponsor" &&
        stakeholder.relationship_status === "active",
    ).length,
    annualContractValue: activeContracts.reduce(
      (sum, contract) => sum + Number(contract.annual_value ?? 0),
      0,
    ),
    expiringSoon: activeContracts.filter(
      (contract) =>
        contract.end_date &&
        contract.end_date >= today &&
        contract.end_date <= throughExpiry,
    ).length,
    contactDue: input.items.filter((item) => item.requiresFollowUp).length,
    activeLeads: input.pipelineEntries.filter((entry) => !entry.closed_at)
      .length,
    missingFollowUp: input.items.filter(
      (item) =>
        item.requiresFollowUp && (!item.nextActionAt || item.overdueFollowUp),
    ).length,
  };
}

export function filterStakeholders(
  items: StakeholderListItem[],
  filters: {
    search: string;
    type: string;
    status: string;
    ownerId: string;
    contract: string;
    followUp: string;
  },
) {
  const needle = filters.search.trim().toLocaleLowerCase("da-DK");
  return items.filter((item) => {
    const searchable = [
      item.name,
      item.cvr_number,
      item.notes,
      item.primaryContact?.name,
      item.primaryContact?.email,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("da-DK");
    if (needle && !searchable.includes(needle)) return false;
    if (filters.type && item.stakeholder_type !== filters.type) return false;
    if (filters.status && item.relationship_status !== filters.status)
      return false;
    if (filters.ownerId && item.internal_owner_user_id !== filters.ownerId)
      return false;
    if (filters.contract === "active" && !item.activeContract) return false;
    if (filters.contract === "none" && item.activeContract) return false;
    if (filters.contract === "expiring" && !item.expiringSoon) return false;
    if (filters.followUp === "required" && !item.requiresFollowUp) return false;
    if (filters.followUp === "overdue" && !item.overdueFollowUp) return false;
    if (filters.followUp === "none" && item.nextActionAt) return false;
    return true;
  });
}
