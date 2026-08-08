import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { getMeetingCapabilities } from "../../src/lib/meeting-capabilities.ts";

const workspace = process.cwd();
const read = (relativePath) =>
  readFile(path.join(workspace, relativePath), "utf8");

test("every meeting viewer receives private-note access from the capability model", () => {
  const viewers = [
    ["viewer", "viewer"],
    ["member", "member"],
    ["member", "chair"],
    ["admin", null],
    ["owner", null],
  ];

  for (const [organizationRole, committeeRole] of viewers) {
    assert.equal(
      getMeetingCapabilities(organizationRole, committeeRole).viewMeeting,
      true,
      `${organizationRole}/${committeeRole ?? "uden udvalgrolle"}`,
    );
  }
});

test("server derives note ownership from auth and requires viewMeeting only", async () => {
  const [service, route, page, component] = await Promise.all([
    read("src/services/meeting-minutes-service.ts"),
    read("src/app/api/meetings/[meetingId]/private-note/route.ts"),
    read(
      "src/app/(app)/organizations/[organizationId]/committees/[committeeId]/meetings/[meetingId]/page.tsx",
    ),
    read("src/components/meetings/meeting-minutes-section.tsx"),
  ]);

  const saveMethod = service.slice(
    service.indexOf("async savePrivateMeetingNote"),
    service.indexOf("async sendForApproval"),
  );
  assert.match(saveMethod, /requireMeetingCapability\([\s\S]*?"viewMeeting"/);
  assert.match(saveMethod, /user_id:\s*user\.id/);
  assert.doesNotMatch(saveMethod, /parsed\.userId|input\.userId/);
  assert.doesNotMatch(saveMethod, /requireActiveReferent|editOfficialMinutes/);
  assert.match(route, /savePrivateMeetingNote/);
  assert.match(
    page,
    /canEditPrivateNotes=\{meetingCapabilities\.viewMeeting\}/,
  );
  assert.match(component, /Kun du kan se disse noter\./);
  assert.match(component, /enabled:\s*true/);
});

test("migration preserves legacy notes and enforces owner-only RLS for all operations", async () => {
  const migration = await read(
    "supabase/migrations/202608060001_private_meeting_notes_hotfix.sql",
  );

  assert.match(migration, /alter column agenda_item_id drop not null/i);
  assert.match(
    migration,
    /unique index[\s\S]*\(meeting_id, user_id\)[\s\S]*agenda_item_id is null/i,
  );
  assert.match(
    migration,
    /insert into public\.agenda_item_private_notes[\s\S]*coalesce\(mm\.updated_by, mm\.created_by\)[\s\S]*mm\.internal_note/i,
  );
  assert.match(
    migration,
    /alter table public\.meeting_minutes drop column internal_note/i,
  );
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.match(migration, new RegExp(`for ${operation}`, "i"));
  }
  assert.ok(
    (migration.match(/user_id\s*=\s*auth\.uid\(\)/gi) ?? []).length >= 5,
    "RLS og trigger skal fastholde den autentificerede bruger",
  );
  assert.match(migration, /public\.is_organization_admin\(organization_id\)/);
  assert.match(migration, /new\.user_id\s*<>\s*auth\.uid\(\)/);
});

test("private notes stay out of shared minutes, AI, and PDF generators", async () => {
  const [service, assistant, libFiles] = await Promise.all([
    read("src/services/meeting-minutes-service.ts"),
    read("src/lib/ai-minutes-assistant.ts"),
    readdir(path.join(workspace, "src/lib")),
  ]);
  const pdfSources = await Promise.all(
    libFiles
      .filter((file) => file.endsWith("pdf.ts"))
      .map((file) => read(`src/lib/${file}`)),
  );
  const saveMinutesMethod = service.slice(
    service.indexOf("async saveMeetingMinutes"),
    service.indexOf("async saveAgendaItemMinutes"),
  );

  assert.doesNotMatch(saveMinutesMethod, /parsed\.internalNote/);
  assert.doesNotMatch(service, /internal_note/);
  assert.doesNotMatch(assistant, /internal_note/);
  for (const source of pdfSources) {
    assert.doesNotMatch(source, /privateMeetingNote|agenda_item_private_notes/);
  }
});
