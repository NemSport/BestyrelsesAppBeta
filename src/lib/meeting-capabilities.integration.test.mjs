import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function read(relativePath) {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

test("web and server boundaries consume action-specific meeting capabilities", () => {
  const quickAction = read("src/components/layout/quick-action-menu.tsx");
  const meetingPage = read(
    "src/app/(app)/organizations/[organizationId]/committees/[committeeId]/meetings/[meetingId]/page.tsx",
  );
  const authorizationService = read("src/services/authorization-service.ts");
  const meetingService = read("src/services/meeting-service.ts");
  const agendaItemService = read("src/services/agenda-item-service.ts");
  const minutesService = read("src/services/meeting-minutes-service.ts");

  assert.match(quickAction, /capabilities\.createMeeting/);
  assert.match(quickAction, /capabilities\.createQuickMeeting/);
  assert.match(quickAction, /capabilities\.scheduleAgendaItem/);
  assert.match(meetingPage, /meetingCapabilities\.manageParticipants/);
  assert.match(meetingPage, /meetingCapabilities\.editOfficialMinutes/);
  assert.match(meetingPage, /meetingCapabilities\.editTasks/);
  assert.match(meetingPage, /meetingCapabilities\.editDecisions/);

  assert.match(authorizationService, /assertMeetingCapability/);
  assert.match(meetingService, /"createMeeting"/);
  assert.match(meetingService, /"createQuickMeeting"/);
  assert.match(meetingService, /"deleteMeeting"/);
  assert.match(agendaItemService, /"updateAgendaItem"/);
  assert.match(agendaItemService, /"scheduleAgendaItem"/);
  assert.match(agendaItemService, /"reorderAgendaItems"/);
  assert.match(minutesService, /"editOfficialMinutes"/);
  assert.match(minutesService, /"manageMinutesApproval"/);
});

test("RLS keeps manager and agenda-editor boundaries aligned", () => {
  const migrationDirectory = join(repositoryRoot, "supabase/migrations");
  const sql = readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrationDirectory, name), "utf8"))
    .join("\n");

  assert.match(
    sql,
    /create or replace function public\.can_manage_committee\(/i,
  );
  assert.match(
    sql,
    /create or replace function public\.can_edit_agenda_item\(/i,
  );
  assert.match(
    sql,
    /meetings_insert_manager[\s\S]*can_manage_committee\(committee_id\)/i,
  );
  assert.match(
    sql,
    /meeting_attendees_manage[\s\S]*can_manage_committee\(committee_id\)/i,
  );
  assert.match(
    sql,
    /meeting_minutes_update_manager[\s\S]*can_manage_committee\(committee_id\)/i,
  );
  assert.match(
    sql,
    /tasks_insert_editor[\s\S]*can_edit_agenda_item\(committee_id\)/i,
  );
  assert.match(
    sql,
    /decisions_insert_editor[\s\S]*can_edit_agenda_item\(committee_id\)/i,
  );
});
