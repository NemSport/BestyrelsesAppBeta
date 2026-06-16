import type { User } from "@supabase/supabase-js";

import type { TableRow } from "@/types/database";

export type Profile = TableRow<"profiles">;
export type Organization = TableRow<"organizations">;
export type OrganizationMember = TableRow<"organization_members">;
export type OrganizationInvitation = TableRow<"organization_invitations">;
export type Committee = TableRow<"committees">;
export type CommitteeMember = TableRow<"committee_members">;
export type Meeting = TableRow<"meetings">;
export type AgendaItem = TableRow<"agenda_items">;
export type AgendaItemOccurrence = TableRow<"agenda_item_occurrences">;
export type MeetingMinutes = TableRow<"meeting_minutes">;
export type AgendaItemMinutes = TableRow<"agenda_item_minutes">;
export type MeetingMinuteApproval = TableRow<"meeting_minute_approvals">;
export type MeetingMinuteAttachment = TableRow<"meeting_minute_attachments">;
export type AgendaItemMinuteAttachment =
  TableRow<"agenda_item_minute_attachments">;
export type TransferredAgendaItem = TableRow<"transferred_agenda_items">;
export type Decision = TableRow<"decisions">;
export type Task = TableRow<"tasks">;
export type TaskComment = TableRow<"task_comments">;
export type AnnualWheelEvent = TableRow<"annual_wheel_events">;
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
  canManage: boolean;
};

export type AnnualWheelEventView = AnnualWheelEvent & {
  committee: Pick<Committee, "id" | "name"> | null;
  meeting: Pick<Meeting, "id" | "title" | "starts_at"> | null;
  task: Pick<Task, "id" | "title" | "status"> | null;
  responsible: Pick<Profile, "id" | "full_name"> | null;
};

export type AnnualWheelCalendarItem = {
  id: string;
  kind: "meeting" | "task" | "decision";
  title: string;
  date: string;
  committeeId: string;
  responsibleUserId: string | null;
  priority: AnnualWheelEvent["priority"];
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

export type MeetingWithAgenda = Meeting & {
  agenda_item_occurrences: Array<
    AgendaItemOccurrence & {
      agenda_items: AgendaItem | null;
    }
  >;
};

export type MeetingWithAgendaPreview = Meeting & {
  agenda_item_occurrences: Array<
    Pick<AgendaItemOccurrence, "position"> & {
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
  status:
    | AgendaItemMinutes["status"]
    | TransferredAgendaItem["status"];
};

export type OrganizationOverview = {
  committees: Array<{
    committee: Committee;
    nextMeeting: MeetingWithAgendaPreview | null;
    upcomingMeetingCount: number;
    openFollowUpCount: number;
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
  minutes: Pick<
    MeetingMinutes,
    "status" | "minutes_text" | "decisions"
  > | null;
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
  responsible: Pick<Profile, "id" | "full_name"> | null;
};

export type TaskCommentView = TaskComment & {
  author: Pick<Profile, "id" | "full_name"> | null;
};

export type TaskRegisterData = {
  tasks: TaskView[];
  committees: Committee[];
  meetings: Meeting[];
  agendaItems: AgendaItem[];
  decisions: DecisionView[];
  members: OrganizationMemberDirectoryEntry[];
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

export type TrashItemType = "organization" | "committee" | "meeting" | "agenda_item";

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
