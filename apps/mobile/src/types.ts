export type Status =
  | "not_started"
  | "in_progress"
  | "waiting"
  | "completed"
  | "cancelled";

export type Organization = {
  id: string;
  name: string;
  committeeCount?: number;
  committees: Committee[];
  role?: string | null;
};

export type Committee = {
  id: string;
  name: string;
  description?: string | null;
};

export type Meeting = {
  id: string;
  organization_id: string;
  committee_id: string;
  title: string;
  description?: string | null;
  starts_at: string;
  status: string;
  committeeName?: string;
  agenda_item_occurrences?: Array<{
    position: number;
    agenda_items: {
      id: string;
      title: string;
      item_type: "information" | "discussion" | "decision" | "follow_up";
    } | null;
  }>;
};

export type Task = {
  id: string;
  organization_id: string;
  committee_id: string;
  meeting_id: string | null;
  agenda_item_id: string | null;
  decision_id: string | null;
  title: string;
  description: string;
  status: Status;
  deadline: string | null;
  category: string | null;
  responsible_user_id: string | null;
  committee?: { id: string; name: string } | null;
  meeting?: { id: string; title: string; starts_at: string } | null;
  agendaItem?: { id: string; title: string; item_type: string } | null;
  decision?: { id: string; title: string } | null;
  responsible?: { id: string; full_name: string | null } | null;
};

export type Decision = {
  id: string;
  title: string;
  description?: string | null;
  decision_date?: string | null;
  status: Status;
  deadline: string | null;
  category: string | null;
  committee?: { id: string; name: string } | null;
  meeting?: { id: string; title: string; starts_at: string } | null;
  agendaItem?: { id: string; title: string; item_type: string } | null;
  responsible?: { id: string; full_name: string | null } | null;
};

export type OrganizationOverview = {
  committees: Array<{
    committee: Committee;
    nextMeeting: Meeting | null;
    upcomingMeetingCount: number;
    openTaskCount: number;
    activeDecisionCount: number;
  }>;
  upcomingMeetings: Meeting[];
  recentMinutes: Array<{
    id: string;
    meetingId: string;
    meetingTitle: string;
    meetingStartsAt: string;
    committeeId: string;
    committeeName: string;
    status: string;
    updatedAt: string;
  }>;
  activeDecisions: Decision[];
  openTasks: Task[];
  myOpenTasks: Task[];
};

export type MeetingDetail = {
  meeting: Meeting;
  minutes: {
    meetingMinutes: {
      minutes_text: string;
      decisions: string;
      status: string;
    } | null;
    agendaItemMinutes: Array<{
      agenda_item_id: string;
      notes: string;
      decision: string;
      follow_up: string;
      status: string;
    }>;
  };
};

export type AiMeetingOverview = {
  status: "ok" | "empty";
  overview: {
    summary: string;
    agenda_summary: string[];
    minutes_summary: string[];
    key_decision_points: string[];
    follow_up_points: string[];
    preparation_points: string[];
    risks_or_attention_points: string[];
    confidence_note: string;
  } | null;
};

export type AiMinutesAssistantAction =
  | "fix_language"
  | "make_formal"
  | "shorten"
  | "make_neutral"
  | "make_decision_ready"
  | "professional_board_style";

export type AiMinutesAssistantSuggestion = {
  action: AiMinutesAssistantAction;
  originalHtml: string;
  originalText: string;
  suggestionHtml: string;
  suggestionText: string;
  summary: string;
  activityLogId?: string | null;
  model?: string | null;
  promptVersion?: string | null;
};
