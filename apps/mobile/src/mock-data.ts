import type { Meeting, Organization, OrganizationOverview, Task } from "./types";

const now = new Date();
const tomorrow = new Date(now.getTime() + 1000 * 60 * 60 * 24);
const nextWeek = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);

const boardCommittee = { id: "mock-committee-board", name: "Bestyrelsen" };
const sponsorCommittee = { id: "mock-committee-sponsor", name: "Sponsorudvalg" };

export const mockOrganization: Organization = {
  id: "mock-organization",
  name: "Vorbasse Boldklub af 1912",
  committees: [boardCommittee, sponsorCommittee],
};

export const mockDefaultMeeting: Meeting = {
  id: "mock-meeting-board",
  organization_id: mockOrganization.id,
  committee_id: boardCommittee.id,
  title: "Bestyrelsesmøde",
  starts_at: tomorrow.toISOString(),
  status: "scheduled",
  committeeName: boardCommittee.name,
  agenda_item_occurrences: [
      {
        position: 1,
        agenda_items: {
          id: "mock-agenda-1",
          title: "Godkendelse af dagsorden",
          item_type: "decision",
        },
      },
      {
        position: 2,
        agenda_items: {
          id: "mock-agenda-2",
          title: "Økonomi og budgetopfølgning",
          item_type: "discussion",
        },
      },
      {
        position: 3,
        agenda_items: {
          id: "mock-agenda-3",
          title: "Sponsorarbejde frem mod sæsonstart",
          item_type: "follow_up",
        },
      },
      {
        position: 4,
        agenda_items: {
          id: "mock-agenda-4",
          title: "Orientering fra udvalg",
          item_type: "information",
        },
      },
      {
        position: 5,
        agenda_items: {
          id: "mock-agenda-5",
          title: "Eventuelt",
          item_type: "discussion",
        },
      },
  ],
};

export const mockSponsorMeeting: Meeting = {
    id: "mock-meeting-sponsor",
    organization_id: mockOrganization.id,
    committee_id: sponsorCommittee.id,
    title: "Sponsorudvalg: opfølgning",
    starts_at: nextWeek.toISOString(),
    status: "scheduled",
    committeeName: sponsorCommittee.name,
    agenda_item_occurrences: [
      {
        position: 1,
        agenda_items: {
          id: "mock-sponsor-1",
          title: "Status på nuværende sponsorer",
          item_type: "information",
        },
      },
      {
        position: 2,
        agenda_items: {
          id: "mock-sponsor-2",
          title: "Nye sponsorprospekter",
          item_type: "discussion",
        },
      },
      {
        position: 3,
        agenda_items: {
          id: "mock-sponsor-3",
          title: "Opfølgning på materialer",
          item_type: "follow_up",
        },
      },
    ],
};

export const mockMeetings: Meeting[] = [mockDefaultMeeting, mockSponsorMeeting];

export const mockTasks: Task[] = [
  {
    id: "mock-task-1",
    organization_id: mockOrganization.id,
    committee_id: boardCommittee.id,
    meeting_id: "mock-meeting-board",
    agenda_item_id: "mock-agenda-2",
    decision_id: null,
    title: "Send budgetudkast til bestyrelsen",
    description: "Klargør kort økonomioverblik før næste møde.",
    status: "in_progress",
    deadline: tomorrow.toISOString(),
    category: "Økonomi",
    responsible_user_id: "mock-user",
    committee: boardCommittee,
    meeting: {
      id: "mock-meeting-board",
      title: "Bestyrelsesmøde",
      starts_at: tomorrow.toISOString(),
    },
    agendaItem: {
      id: "mock-agenda-2",
      title: "Økonomi og budgetopfølgning",
      item_type: "discussion",
    },
    decision: null,
    responsible: { id: "mock-user", full_name: "Mathias Jensen" },
  },
  {
    id: "mock-task-2",
    organization_id: mockOrganization.id,
    committee_id: sponsorCommittee.id,
    meeting_id: "mock-meeting-sponsor",
    agenda_item_id: "mock-sponsor-3",
    decision_id: null,
    title: "Opdatér sponsorliste",
    description: "Marker hvem der skal kontaktes før månedsskiftet.",
    status: "not_started",
    deadline: nextWeek.toISOString(),
    category: "Sponsor",
    responsible_user_id: null,
    committee: sponsorCommittee,
    meeting: {
      id: "mock-meeting-sponsor",
      title: "Sponsorudvalg: opfølgning",
      starts_at: nextWeek.toISOString(),
    },
    agendaItem: {
      id: "mock-sponsor-3",
      title: "Opfølgning på materialer",
      item_type: "follow_up",
    },
    decision: null,
    responsible: null,
  },
];

export const mockOverview: OrganizationOverview = {
  committees: [
    {
      committee: boardCommittee,
      nextMeeting: mockDefaultMeeting,
      upcomingMeetingCount: 1,
      openTaskCount: 1,
      activeDecisionCount: 2,
    },
    {
      committee: sponsorCommittee,
      nextMeeting: mockSponsorMeeting,
      upcomingMeetingCount: 1,
      openTaskCount: 1,
      activeDecisionCount: 1,
    },
  ],
  upcomingMeetings: mockMeetings,
  recentMinutes: [
    {
      id: "mock-minutes-1",
      meetingId: "mock-meeting-board",
      meetingTitle: "Bestyrelsesmøde",
      meetingStartsAt: tomorrow.toISOString(),
      committeeId: "mock-committee-board",
      committeeName: "Bestyrelsen",
      status: "draft",
      updatedAt: now.toISOString(),
    },
  ],
  activeDecisions: [],
  openTasks: mockTasks,
  myOpenTasks: mockTasks,
};
