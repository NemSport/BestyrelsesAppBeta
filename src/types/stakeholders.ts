import type { Database, TableRow } from "@/types/database";
import type { DocumentListItem } from "@/types/documents";
import type {
  Committee,
  OrganizationMemberDirectoryEntry,
  TaskStakeholderContractOption,
  TaskStakeholderOption,
  TaskView,
} from "@/types/domain";

export type Stakeholder = TableRow<"stakeholders">;
export type StakeholderContact = TableRow<"stakeholder_contacts">;
export type StakeholderContract = TableRow<"stakeholder_contracts">;
export type StakeholderDeliverable =
  TableRow<"stakeholder_contract_deliverables">;
export type StakeholderActivity = TableRow<"stakeholder_activities">;
export type StakeholderPipelineEntry = TableRow<"stakeholder_pipeline_entries">;
export type StakeholderPipelineEvent = TableRow<"stakeholder_pipeline_events">;
export type StakeholderType = Database["public"]["Enums"]["stakeholder_type"];
export type StakeholderRelationshipStatus =
  Database["public"]["Enums"]["stakeholder_relationship_status"];
export type StakeholderContractStatus =
  Database["public"]["Enums"]["stakeholder_contract_status"];
export type StakeholderActivityType =
  Database["public"]["Enums"]["stakeholder_activity_type"];
export type StakeholderPipelineStage =
  Database["public"]["Enums"]["stakeholder_pipeline_stage"];

export type StakeholderCapabilities = {
  viewStakeholders: boolean;
  createStakeholders: boolean;
  updateStakeholders: boolean;
  archiveStakeholders: boolean;
  manageContacts: boolean;
  manageContracts: boolean;
  managePipeline: boolean;
  addActivities: boolean;
};

export type StakeholderListItem = Stakeholder & {
  ownerName: string | null;
  primaryContact: StakeholderContact | null;
  activeAnnualValue: number;
  activeContract: StakeholderContract | null;
  pipelineEntry: StakeholderPipelineEntry | null;
  nextActionAt: string | null;
  nextActionLabel: string | null;
  requiresFollowUp: boolean;
  overdueFollowUp: boolean;
  expiringSoon: boolean;
};

export type StakeholderKpis = {
  activeSponsors: number;
  annualContractValue: number;
  expiringSoon: number;
  contactDue: number;
  activeLeads: number;
  missingFollowUp: number;
};

export type StakeholderWorkspaceData = {
  stakeholders: StakeholderListItem[];
  pipeline: Array<
    StakeholderPipelineEntry & {
      stakeholder: Stakeholder;
      ownerName: string | null;
    }
  >;
  kpis: StakeholderKpis;
  members: OrganizationMemberDirectoryEntry[];
  capabilities: StakeholderCapabilities;
  upcomingActions: Array<{
    id: string;
    title: string;
    date: string;
    overdue: boolean;
    href: string;
  }>;
};

export type StakeholderProfileData = {
  stakeholder: StakeholderListItem;
  contacts: StakeholderContact[];
  contracts: Array<
    StakeholderContract & { deliverables: StakeholderDeliverable[] }
  >;
  activities: Array<StakeholderActivity & { creatorName: string | null }>;
  pipelineEntries: StakeholderPipelineEntry[];
  pipelineEvents: StakeholderPipelineEvent[];
  documents: DocumentListItem[];
  availableDocuments: Array<{ id: string; title: string }>;
  tasks: TaskView[];
  taskCommittees: Array<Pick<Committee, "id" | "name">>;
  taskStakeholders: TaskStakeholderOption[];
  taskStakeholderContracts: TaskStakeholderContractOption[];
  members: OrganizationMemberDirectoryEntry[];
  editableCommitteeIds: string[];
  capabilities: StakeholderCapabilities;
};

export type StakeholderActionSource = {
  stakeholders: Stakeholder[];
  contracts: StakeholderContract[];
  pipelineEntries: StakeholderPipelineEntry[];
};
