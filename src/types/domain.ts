import type { User } from "@supabase/supabase-js";

import type { MeetingCapabilities } from "@/lib/permissions";
import type { TableRow } from "@/types/database";

export type Profile = TableRow<"profiles">;
export type Organization = TableRow<"organizations">;
export type OrganizationBranding = TableRow<"organization_branding">;
export type OrganizationMember = TableRow<"organization_members">;
export type OrganizationInvitation = TableRow<"organization_invitations">;
export type Committee = TableRow<"committees">;
export type CommitteeMember = TableRow<"committee_members">;
export type Meeting = TableRow<"meetings">;
export type MeetingAttendee = TableRow<"meeting_attendees">;
export type MeetingExternalAttendee = TableRow<"meeting_external_attendees">;
export type AgendaItem = TableRow<"agenda_items">;
export type AgendaItemOccurrence = TableRow<"agenda_item_occurrences">;
export type MeetingMinutes = TableRow<"meeting_minutes">;
export type MeetingMinutesReferentLock =
  TableRow<"meeting_minutes_referent_locks">;
export type AgendaItemMinutes = TableRow<"agenda_item_minutes">;
export type AgendaItemPrivateNote = TableRow<"agenda_item_private_notes">;
export type MeetingMinuteApproval = TableRow<"meeting_minute_approvals">;
export type MeetingMinuteAttachment = TableRow<"meeting_minute_attachments">;
export type AgendaItemMinuteAttachment =
  TableRow<"agenda_item_minute_attachments">;
export type TransferredAgendaItem = TableRow<"transferred_agenda_items">;
export type Decision = TableRow<"decisions">;
export type Task = TableRow<"tasks">;
export type TaskComment = TableRow<"task_comments">;
export type ActionPersonalState = TableRow<"action_user_states">;
export type AnnualWheelEvent = TableRow<"annual_wheel_events">;
export type AnnualWheelKeyPerson = TableRow<"annual_wheel_key_people">;
export type AnnualWheelTaskTemplate = TableRow<"annual_wheel_task_templates">;
export type RoleProfile = TableRow<"role_profiles">;
export type ResponsibilityArea = TableRow<"responsibility_areas">;
export type TaskTemplate = TableRow<"task_templates">;
export type RoleDocument = TableRow<"role_documents">;
export type OnboardingGuide = TableRow<"onboarding_guides">;

export type RoleProfileView = RoleProfile & {
  responsibilityAreas: ResponsibilityArea[];
  committees: Committee[];
  assignments: Array<{
    id: string;
    userId: string;
    name: string;
    email: string;
    startsOn: string;
  }>;
  taskTemplates: TaskTemplate[];
  documents: RoleDocument[];
  onboardingGuide: OnboardingGuide | null;
  relatedTasks: TaskView[];
  annualWheelEvents: AnnualWheelEventView[];
  decisions: DecisionView[];
};

export type JobCardOverview = {
  currentUserId: string;
  roles: RoleProfileView[];
  responsibilityAreas: ResponsibilityArea[];
  committees: Committee[];
  members: OrganizationMemberDirectoryEntry[];
  annualWheelEvents: AnnualWheelEventView[];
  decisions: DecisionView[];
  editableCommitteeIds: string[];
  canManage: boolean;
};

export type AnnualWheelEventView = AnnualWheelEvent & {
  committee: Pick<Committee, "id" | "name"> | null;
  meeting: Pick<Meeting, "id" | "title" | "starts_at"> | null;
  task: Pick<Task, "id" | "title" | "status"> | null;
  responsible: Pick<Profile, "id" | "full_name"> | null;
  keyPeople: AnnualWheelKeyPerson[];
  taskTemplates: AnnualWheelTaskTemplate[];
  activatedTasks: Array<
    Pick<
      Task,
      | "id"
      | "title"
      | "status"
      | "deadline"
      | "responsible_user_id"
      | "annual_wheel_event_id"
      | "annual_wheel_activation_year"
      | "annual_wheel_task_template_id"
      | "archived_at"
    >
  >;
};

export type AnnualWheelCalendarItem = {
  id: string;
  kind: "meeting" | "task" | "decision";
  title: string;
  date: string;
  committeeId: string;
  responsibleUserId: string | null;
  priority: AnnualWheelEvent["priority"];
  status?: Task["status"] | Decision["status"];
  href: string;
};

export type AnnualWheelOverview = {
  year: number;
  events: AnnualWheelEventView[];
  committees: Committee[];
  members: OrganizationMemberDirectoryEntry[];
  editableCommitteeIds: string[];
  canEditOrganization: boolean;
  calendarItems: AnnualWheelCalendarItem[];
};

export type AuthenticatedUser = {
  user: User;
  profile: Profile | null;
};

export type OrganizationSummary = Organization & {
  role: OrganizationMember["role"];
  committees: Committee[];
};

export type OrganizationWorkspaceEntry = Pick<Organization, "id" | "name"> & {
  role: OrganizationMember["role"];
  committeeCount: number;
  logoUrl: string | null;
};

export type OrganizationMemberDirectoryEntry = {
  user_id: string;
  full_name: string | null;
  email: string;
  role: OrganizationMember["role"];
  status: OrganizationMember["status"];
  committees: Array<{
    id: string;
    name: string;
    role: CommitteeMember["role"];
  }>;
};

export type AgendaItemWithOccurrences = AgendaItem & {
  agenda_item_occurrences: Array<
    AgendaItemOccurrence & {
      meetings: Pick<Meeting, "id" | "title" | "starts_at" | "status"> | null;
    }
  >;
};

export type AgendaItemHistoryEntry = {
  id: string;
  occurrenceId: string | null;
  threadId: string;
  meetingId: string | null;
  meetingTitle: string | null;
  meetingDate: string | null;
  meetingStatus: Meeting["status"] | null;
  agendaItemNumber: number | null;
  title: string;
  type: AgendaItem["item_type"];
  background: string;
  objective: string;
  outcomeSummary: string;
  status:
    | AgendaItem["lifecycle_status"]
    | AgendaItemOccurrence["meeting_status"];
  minutes: {
    notes: string;
    decision: string;
    followUp: string;
    status: AgendaItemMinutes["status"];
  } | null;
  decisions: Array<{
    id: string;
    title: string;
    description: string;
    status: Decision["status"];
    decisionDate: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: Task["status"];
    deadline: string | null;
    responsibleName: string | null;
  }>;
  openTaskCount: number;
  transfer: {
    reason: TransferredAgendaItem["transfer_reason"];
    status: TransferredAgendaItem["status"];
  } | null;
  createdAt: string;
};

export type AgendaItemHistoryLinkCandidate = {
  agendaItemId: string;
  threadId: string;
  title: string;
  itemType: AgendaItem["item_type"];
  agendaItemNumber: number | null;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  historyCount: number;
};

export type MeetingWithAgenda = Meeting & {
  agenda_item_occurrences: Array<
    AgendaItemOccurrence & {
      agenda_items: AgendaItem | null;
    }
  >;
};

export type MeetingWithAgendaPreview = Meeting & {
  agenda_item_occurrences: Array<
    Pick<AgendaItemOccurrence, "id" | "position"> & {
      agenda_items: Pick<AgendaItem, "id" | "title" | "item_type"> | null;
    }
  >;
};

export type CommitteeOverviewActionItem = {
  id: string;
  agendaItemId: string;
  meetingId: string;
  meetingTitle: string;
  meetingStartsAt: string;
  title: string;
  itemType: AgendaItem["item_type"];
  status: AgendaItemMinutes["status"];
};

export type CommitteeOverviewTransfer = {
  id: string;
  agendaItemId: string;
  meetingId: string;
  meetingTitle: string;
  title: string;
  itemType: AgendaItem["item_type"];
  status: TransferredAgendaItem["status"];
};

export type CommitteeOverviewMember = {
  userId: string;
  name: string;
  email: string;
  role: CommitteeMember["role"];
};

export type CommitteeOverview = {
  meetings: MeetingWithAgendaPreview[];
  recentMinutes: Array<{
    id: string;
    meetingId: string;
    meetingTitle: string;
    meetingStartsAt: string;
    status: MeetingMinutes["status"];
    updatedAt: string;
  }>;
  openFollowUps: CommitteeOverviewActionItem[];
  decisionsRequired: CommitteeOverviewActionItem[];
  transfers: CommitteeOverviewTransfer[];
  members: CommitteeOverviewMember[];
  myOpenTasks: TaskView[];
  activeDecisions: DecisionView[];
};

export type CommitteeWorkspaceActivity = {
  id: string;
  kind: "meeting" | "task" | "decision" | "document" | "activity";
  title: string;
  detail: string;
  occurredAt: string;
  href: string;
};

export type CommitteeWorkspace = {
  committee: Committee;
  members: CommitteeOverviewMember[];
  nextMeeting: MeetingWithAgendaPreview | null;
  activeTasks: TaskView[];
  upcomingActivities: AnnualWheelEventView[];
  recentDocuments: Array<{
    id: string;
    name: string;
    updatedAt: string;
    fileName: string | null;
    mimeType: string | null;
    uploaderName: string;
  }>;
  recentActivity: CommitteeWorkspaceActivity[];
};

export type CommitteeDirectoryEntry = {
  committee: Committee;
  members: CommitteeOverviewMember[];
  activeTaskCount: number;
  overdueTaskCount: number;
  upcomingMeetingCount: number;
  nextMeeting: Pick<Meeting, "id" | "title" | "starts_at"> | null;
  nextActivity: Pick<
    AnnualWheelEvent,
    "id" | "title" | "starts_on" | "ends_on"
  > | null;
};

export type OrganizationOverviewActionItem = {
  id: string;
  kind: "follow_up" | "decision" | "transfer";
  agendaItemId: string;
  meetingId: string;
  meetingTitle: string;
  committeeId: string;
  committeeName: string;
  title: string;
  itemType: AgendaItem["item_type"];
  status: AgendaItemMinutes["status"] | TransferredAgendaItem["status"];
};

export type PendingMinutesApprovalReminder = {
  id: string;
  meetingMinutesId: string;
  meetingId: string;
  meetingTitle: string;
  meetingStartsAt: string;
  committeeId: string;
  committeeName: string;
  status: MeetingMinuteApproval["status"];
  approvalDeadline: string | null;
  updatedAt: string;
};

export type ApprovalActionSource = {
  approvalId: string;
  organizationId: string;
  userId: string;
  approvalStatus: MeetingMinuteApproval["status"];
  meetingMinutesId: string;
  minutesStatus: MeetingMinutes["status"];
  approvalDeadline: string | null;
  meetingId: string;
  meetingTitle: string;
  meetingStartsAt: string;
  committeeId: string;
  committeeName: string;
  updatedAt: string;
};

export type ActionItem = {
  key: string;
  type:
    | "task_overdue"
    | "task_due_soon"
    | "task_reminder"
    | "stakeholder_follow_up"
    | "stakeholder_contract_notice"
    | "stakeholder_contract_renewal"
    | "stakeholder_contract_end"
    | "stakeholder_pipeline_follow_up"
    | "minutes_approval"
    | "annual_wheel_overdue"
    | "annual_wheel_due";
  category: "requires_action" | "deadline" | "follow_up" | "information";
  priority: "critical" | "soon" | "follow_up" | "information";
  audience: "personal" | "organization";
  title: string;
  description: string;
  context: string;
  href: string;
  sourceType:
    | "task"
    | "meeting_minutes"
    | "annual_wheel_event"
    | "stakeholder"
    | "stakeholder_contract"
    | "stakeholder_pipeline";
  sourceId: string;
  responsibleUserId: string | null;
  deadline: string | null;
  daysUntil: number | null;
  occurredAt: string;
  state: "inbox" | "claimed" | "snoozed" | "dismissed" | "resolved";
  snoozedUntil: string | null;
  dismissalReason: string | null;
  reminderAt?: string | null;
  followUpAt?: string | null;
  stakeholderId?: string;
  meetingId?: string;
  committeeId?: string;
  task?: TaskView;
};

export type ActionCenterData = {
  userId: string;
  inbox: ActionItem[];
  mine: ActionItem[];
  completed: ActionItem[];
  activeCount: number;
  delegationMembers: OrganizationMemberDirectoryEntry[];
  editableCommitteeIds: string[];
  nextRefreshAt: string | null;
};

export type OrganizationOverview = {
  committees: Array<{
    committee: Committee;
    capabilities: MeetingCapabilities;
    nextMeeting: MeetingWithAgendaPreview | null;
    upcomingMeetingCount: number;
    openFollowUpCount: number;
    openTaskCount: number;
    activeDecisionCount: number;
  }>;
  upcomingMeetings: Array<
    MeetingWithAgendaPreview & {
      committeeName: string;
    }
  >;
  recentMinutes: Array<{
    id: string;
    meetingId: string;
    meetingTitle: string;
    meetingStartsAt: string;
    committeeId: string;
    committeeName: string;
    status: MeetingMinutes["status"];
    updatedAt: string;
  }>;
  pendingMinutesApprovals: PendingMinutesApprovalReminder[];
  actionItems: OrganizationOverviewActionItem[];
  activeDecisions: DecisionView[];
  openTasks: TaskView[];
  myOpenTasks: TaskView[];
  metrics: {
    committeeCount: number;
    upcomingMeetingCount: number;
    recentMinutesCount: number;
    openFollowUpCount: number;
    decisionsRequiredCount: number;
    activeDecisionCount: number;
    openTaskCount: number;
    myOpenTaskCount: number;
  };
};

export type MinutesResponsiblePerson = {
  id: string;
  name: string;
  email: string;
};

export type MeetingMinutesBundle = {
  meetingMinutes: MeetingMinutes | null;
  agendaItemMinutes: AgendaItemMinutes[];
  privateAgendaItemNotes: AgendaItemPrivateNote[];
  responsiblePeople: MinutesResponsiblePerson[];
  approvals: MeetingMinuteApprovalView[];
  meetingAttachments: MinuteAttachmentView[];
  agendaItemAttachments: MinuteAttachmentView[];
  canApprove: boolean;
};

export type MeetingMinuteApprovalView = MeetingMinuteApproval & {
  memberName: string;
  memberEmail: string;
};

export type MinuteAttachmentView = {
  id: string;
  meetingId: string;
  agendaItemId: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
};

export type PreviousMeetingMinutesReference = {
  meeting: Pick<Meeting, "id" | "title" | "starts_at"> | null;
  minutes: Pick<MeetingMinutes, "status" | "minutes_text" | "decisions"> | null;
  agendaItemMinutes: Array<{
    id: string;
    position: number;
    title: string;
    itemType: AgendaItem["item_type"];
    notes: string;
    decision: string;
    followUp: string;
  }>;
};

export type TransferredAgendaItemView = TransferredAgendaItem & {
  sourceMeeting: Pick<Meeting, "id" | "title" | "starts_at">;
  sourceAgendaItem: Pick<AgendaItem, "id" | "title" | "item_type">;
  targetMeeting: Pick<Meeting, "id" | "title" | "starts_at"> | null;
};

export type TransferMeetingOption = Pick<
  Meeting,
  "id" | "title" | "starts_at" | "status"
>;

export type DecisionView = Decision & {
  committee: Pick<Committee, "id" | "name"> | null;
  meeting: Pick<Meeting, "id" | "title" | "starts_at"> | null;
  agendaItem: Pick<AgendaItem, "id" | "title" | "item_type"> | null;
  responsible: Pick<Profile, "id" | "full_name"> | null;
};

export type DecisionRegisterData = {
  decisions: DecisionView[];
  committees: Committee[];
  meetings: Meeting[];
  agendaItems: AgendaItem[];
  members: OrganizationMemberDirectoryEntry[];
  editableCommitteeIds: string[];
};

export type MeetingDecisionContext = {
  decisions: DecisionView[];
  categorySource: DecisionView[];
  historyByAgendaItem: Record<
    string,
    { categories: string[]; decisions: DecisionView[] }
  >;
  responsiblePeople: Array<{ id: string; name: string }>;
  canEdit: boolean;
};

export type AgendaItemDecisionHistory = {
  categories: string[];
  decisions: DecisionView[];
};

export type TaskView = Task & {
  committee: Pick<Committee, "id" | "name"> | null;
  meeting: Pick<Meeting, "id" | "title" | "starts_at"> | null;
  agendaItem: Pick<AgendaItem, "id" | "title" | "item_type"> | null;
  decision: Pick<Decision, "id" | "title"> | null;
  stakeholder?: { id: string; name: string; stakeholder_type: string } | null;
  stakeholderContract?: { id: string; title: string } | null;
  responsible: Pick<Profile, "id" | "full_name"> | null;
};

export type TaskStakeholderOption = Pick<
  TableRow<"stakeholders">,
  "id" | "name"
>;

export type TaskStakeholderContractOption = Pick<
  TableRow<"stakeholder_contracts">,
  "id" | "stakeholder_id" | "title"
>;

export type IncomingTransferredAgendaItemView = {
  id: string;
  targetAgendaItemId: string | null;
  sourceStatus: AgendaItemMinutes["status"];
  transferReason: TransferredAgendaItem["transfer_reason"];
  targetItemType: AgendaItem["item_type"];
  sourceMeeting: Pick<Meeting, "id" | "title" | "starts_at"> | null;
  sourceAgendaItem: Pick<
    AgendaItem,
    "id" | "title" | "description" | "objective" | "item_type"
  > | null;
  sourceOccurrence: Pick<
    AgendaItemOccurrence,
    "id" | "meeting_id" | "agenda_item_id" | "position"
  > | null;
  sourceMinutes: Pick<
    AgendaItemMinutes,
    "id" | "notes" | "decision" | "follow_up"
  > | null;
  sourceTasks: TaskView[];
};

export type TaskCommentView = TaskComment & {
  author: Pick<Profile, "id" | "full_name"> | null;
};

export type TaskRegisterData = {
  userId: string;
  tasks: TaskView[];
  committees: Committee[];
  meetings: Meeting[];
  agendaItems: AgendaItem[];
  decisions: DecisionView[];
  members: OrganizationMemberDirectoryEntry[];
  stakeholders: TaskStakeholderOption[];
  stakeholderContracts: TaskStakeholderContractOption[];
  editableCommitteeIds: string[];
};

export type MeetingTaskContext = {
  tasks: TaskView[];
  categorySource: TaskView[];
  responsiblePeople: Array<{ id: string; name: string }>;
  canEdit: boolean;
};

export type MyTasksData = {
  tasks: TaskView[];
  editableCommitteeIds: string[];
};

export type TrashItemType =
  | "organization"
  | "committee"
  | "meeting"
  | "agenda_item";

export type OrganizationTrashItem = {
  id: string;
  type: TrashItemType;
  title: string;
  organizationId: string;
  committeeId: string | null;
  committeeName: string | null;
  meetingId: string | null;
  meetingTitle: string | null;
  deletedAt: string;
  deletedBy: string | null;
  deletedByName: string | null;
  deleteExpiresAt: string;
  daysLeft: number;
  status: "restorable" | "ready_for_permanent_delete";
  canRestore: boolean;
  restoreBlockedReason: string | null;
};

export type OrganizationTrashData = {
  items: OrganizationTrashItem[];
};
