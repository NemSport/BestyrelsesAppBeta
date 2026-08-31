import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  filterMeetingList,
  getMeetingListAction,
  getMeetingListPeriod,
  groupMeetingList,
  parseMeetingListFilters,
} from "../../src/lib/meeting-list.ts";
import { getMeetingCapabilities } from "../../src/lib/meeting-capabilities.ts";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [
  organizationPage,
  committeePage,
  meetingList,
  agendaPreview,
  filters,
  overviewContext,
  repository,
] = await Promise.all([
  source(
    "../../src/app/(app)/organizations/[organizationId]/meetings/page.tsx",
  ),
  source(
    "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/meetings/page.tsx",
  ),
  source("../../src/components/meetings/meeting-list.tsx"),
  source("../../src/components/meetings/meeting-agenda-preview.tsx"),
  source("../../src/components/meetings/meeting-list-filters.tsx"),
  source("../../src/components/meetings/meeting-overview-context.tsx"),
  source("../../src/repositories/meeting-repository.ts"),
]);

function meeting({ id, startsAt, status = "scheduled", createdAt = startsAt }) {
  return {
    id,
    committee_id: "committee-1",
    starts_at: startsAt,
    created_at: createdAt,
    status,
  };
}

const now = new Date("2026-07-24T12:00:00Z").getTime();

test("default buckets distinguish current, previous, and cancelled meetings", () => {
  assert.equal(
    getMeetingListPeriod(
      meeting({ id: "future", startsAt: "2026-08-01T10:00:00Z" }),
      now,
    ),
    "upcoming",
  );
  assert.equal(
    getMeetingListPeriod(
      meeting({
        id: "active",
        startsAt: "2026-07-20T10:00:00Z",
        status: "in_progress",
      }),
      now,
    ),
    "upcoming",
  );
  assert.equal(
    getMeetingListPeriod(
      meeting({ id: "past", startsAt: "2026-07-01T10:00:00Z" }),
      now,
    ),
    "previous",
  );
  assert.equal(
    getMeetingListPeriod(
      meeting({
        id: "cancelled",
        startsAt: "2026-08-02T10:00:00Z",
        status: "cancelled",
      }),
      now,
    ),
    "cancelled",
  );
});

test("default order is next first and newest history first", () => {
  const grouped = groupMeetingList(
    [
      meeting({ id: "future-late", startsAt: "2026-09-01T10:00:00Z" }),
      meeting({ id: "past-old", startsAt: "2026-05-01T10:00:00Z" }),
      meeting({ id: "future-next", startsAt: "2026-07-25T10:00:00Z" }),
      meeting({ id: "past-new", startsAt: "2026-07-20T10:00:00Z" }),
    ],
    now,
  );

  assert.deepEqual(
    grouped.upcoming.map(({ id }) => id),
    ["future-next", "future-late"],
  );
  assert.deepEqual(
    grouped.previous.map(({ id }) => id),
    ["past-new", "past-old"],
  );
});

test("URL filters are validated and combine status, period, and exact date", () => {
  const valid = parseMeetingListFilters({
    date: "2026-07-25",
    period: "upcoming",
    status: "scheduled",
  });
  assert.deepEqual(valid, {
    committeeId: "",
    date: "2026-07-25",
    period: "upcoming",
    status: "scheduled",
  });
  assert.deepEqual(
    parseMeetingListFilters({
      date: "25-07-2026",
      period: "other",
      status: "private",
    }),
    { committeeId: "", date: "", period: "", status: "" },
  );

  const filtered = filterMeetingList(
    [
      meeting({ id: "match", startsAt: "2026-07-25T10:00:00Z" }),
      meeting({
        id: "wrong-status",
        startsAt: "2026-07-25T12:00:00Z",
        status: "draft",
      }),
      meeting({ id: "wrong-date", startsAt: "2026-07-26T10:00:00Z" }),
    ],
    valid,
    now,
  );
  assert.deepEqual(
    filtered.map(({ id }) => id),
    ["match"],
  );

  const committeeFiltered = filterMeetingList(
    [
      meeting({ id: "visible", startsAt: "2026-07-25T10:00:00Z" }),
      {
        ...meeting({ id: "other", startsAt: "2026-07-25T10:00:00Z" }),
        committee_id: "committee-2",
      },
    ],
    { ...valid, committeeId: "committee-1" },
    now,
  );
  assert.deepEqual(
    committeeFiltered.map(({ id }) => id),
    ["visible"],
  );
});

test("next action follows Issue 16 capabilities for every role", () => {
  const viewer = getMeetingCapabilities("viewer", "viewer");
  const member = getMeetingCapabilities("member", "member");
  const chair = getMeetingCapabilities("member", "chair");
  const admin = getMeetingCapabilities("admin", null);

  assert.equal(
    getMeetingListAction("scheduled", viewer).label,
    "Åbn dagsorden",
  );
  assert.equal(
    getMeetingListAction("scheduled", member).label,
    "Åbn dagsorden",
  );
  assert.equal(getMeetingListAction("scheduled", chair).label, "Åbn dagsorden");
  assert.equal(getMeetingListAction("scheduled", admin).label, "Åbn dagsorden");
  assert.equal(
    getMeetingListAction("in_progress", chair).label,
    "Fortsæt møde",
  );
  assert.equal(
    getMeetingListAction("completed", chair, "draft").label,
    "Færdiggør referat",
  );
  assert.equal(
    getMeetingListAction("completed", viewer, "draft").label,
    "Se referat",
  );
  assert.equal(
    getMeetingListAction("completed", chair, "ready_for_approval").label,
    "Se referat",
  );
  assert.equal(getMeetingListAction("completed", viewer).label, "Se referat");
});

test("rows expose native deep links, text status, and mobile-safe metadata", () => {
  assert.match(meetingList, /<article/);
  assert.match(meetingList, /<Link[\s\S]*href=\{meetingHref\}/);
  assert.match(meetingList, /<time dateTime=\{meeting\.starts_at\}>/);
  assert.match(meetingList, /meetingOverviewStatus\(meeting\)/);
  assert.match(meetingList, /Dagsorden klar/);
  assert.match(meetingList, /Referat mangler/);
  assert.match(meetingList, /Afventer godkendelse/);
  assert.match(meetingList, /Afsluttet/);
  assert.match(meetingList, /aria-label=\{`\$\{action\.label\}:/);
  assert.match(meetingList, /break-words/);
  assert.doesNotMatch(meetingList, /overflow-x-auto/);
  assert.match(meetingList, /<Dropdown/);
  assert.doesNotMatch(meetingList, /overflow-x-auto/);
});

test("filter state and empty results remain distinguishable", () => {
  assert.match(filters, /method="get"/);
  assert.match(filters, /aria-label="Mødeperiode"/);
  assert.match(filters, /\["upcoming", "Kommende"\]/);
  assert.match(filters, /\["previous", "Afholdte"\]/);
  assert.match(filters, /name="committee"/);
  assert.match(filters, /name="status"/);
  assert.match(filters, /name="date"/);
  assert.match(filters, /Ryd filtre/);
  assert.match(organizationPage, /Ingen møder matcher filtrene/);
  assert.match(committeePage, /Ingen møder matcher filtrene/);
  assert.match(committeePage, /Ingen kommende møder/);
});

test("agenda preview is accessible, linked, and limited to four rows", () => {
  assert.match(agendaPreview, /meetingAgendaPreviewLimit = 4/);
  assert.match(agendaPreview, /aria-expanded=\{expanded\}/);
  assert.match(agendaPreview, /aria-controls=\{panelId\}/);
  assert.match(
    agendaPreview,
    /agendaItems\.slice\(0, meetingAgendaPreviewLimit\)/,
  );
  assert.match(agendaPreview, /\+ \{hiddenCount\} flere punkter/);
  assert.match(
    agendaPreview,
    /agendaItems\.length - meetingAgendaPreviewLimit/,
  );
  assert.match(agendaPreview, /\{item\.displayNumber\}\./);
  assert.match(agendaPreview, /type=\{item\.item_type\}/);
  assert.match(
    agendaPreview,
    /href=\{`\$\{meetingHref\}#agenda-point-\$\{item\.occurrenceId\}`\}/,
  );
});

test("organization overview uses the existing shell and a secondary context column", () => {
  assert.match(organizationPage, /title="Mødeoversigt"/);
  assert.match(organizationPage, /data-meeting-overview/);
  assert.match(organizationPage, /79fr.*21fr/);
  assert.match(organizationPage, /<MeetingOverviewContext/);
  assert.match(overviewContext, /Næste møde/);
  assert.match(overviewContext, /Kræver handling/);
  assert.match(overviewContext, /Hurtig adgang/);
  assert.doesNotMatch(organizationPage, /AppShell|OrganizationNav|Topbar/);
});

test("create meeting remains capability-gated", () => {
  assert.match(
    organizationPage,
    /overview\.committees\.find\([\s\S]*capabilities\.createMeeting/,
  );
  assert.match(organizationPage, /\{meetingCommittee \? \(/);
  assert.match(committeePage, /capabilities\.createMeeting \? \(/);
});

test("organization and committee queries preserve authorization scope", () => {
  assert.match(organizationPage, /requireOrganizationMember/);
  assert.match(
    organizationPage,
    /overview\.committees\.map\(\(\{ committee, capabilities \}\)/,
  );
  assert.match(committeePage, /requireCommitteeMember/);
  assert.match(committeePage, /getMeetingCapabilities/);
  assert.match(repository, /\.eq\("organization_id", organizationId\)/);
  assert.match(repository, /\.eq\("committee_id", committeeId\)/);
  assert.match(repository, /\.is\("deleted_at", null\)/g);
});
