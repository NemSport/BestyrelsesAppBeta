import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { getMeetingCapabilities } from "../../src/lib/meeting-capabilities.ts";
import { getMemberAccessCapabilities } from "../../src/lib/member-access-capabilities.ts";
import { canManageOrganizationTrash } from "../../src/lib/trash-capabilities.ts";

const migrationsUrl = new URL("../../supabase/migrations/", import.meta.url);

test("phase 1 role boundaries compose without privilege escalation", () => {
  const viewer = getMeetingCapabilities("viewer", "viewer");
  assert.equal(viewer.viewMeeting, true);
  assert.equal(viewer.editNotes, false);
  assert.equal(viewer.createMeeting, false);
  assert.equal(canManageOrganizationTrash("viewer"), false);

  const member = getMeetingCapabilities("member", "member");
  assert.equal(member.createMeeting, false);
  assert.equal(member.manageParticipants, false);
  assert.equal(member.editOfficialMinutes, false);
  assert.equal(member.createAgendaItem, true);
  assert.equal(member.editNotes, true);
  assert.equal(member.editTasks, true);
  assert.equal(member.editDecisions, true);
  assert.equal(canManageOrganizationTrash("member"), false);

  const chair = getMeetingCapabilities("member", "chair");
  assert.equal(chair.createMeeting, true);
  assert.equal(chair.manageParticipants, true);
  assert.equal(chair.editOfficialMinutes, true);
  assert.equal(chair.deleteMeeting, true);
  assert.equal(chair.restoreMeeting, false);
  assert.deepEqual(
    getMemberAccessCapabilities({
      actorUserId: "chair",
      actorRole: "member",
      targetUserId: "member",
      targetRole: "member",
      activeOwnerCount: 1,
    }).canEditAccess,
    false,
  );
  assert.equal(canManageOrganizationTrash("member"), false);

  const admin = getMeetingCapabilities("admin", null);
  assert.equal(admin.createMeeting, true);
  assert.equal(admin.restoreMeeting, true);
  assert.equal(admin.restoreAgendaItem, true);
  assert.equal(
    getMemberAccessCapabilities({
      actorUserId: "admin",
      actorRole: "admin",
      targetUserId: "member",
      targetRole: "member",
      activeOwnerCount: 1,
    }).canEditAccess,
    true,
  );
  assert.equal(
    getMemberAccessCapabilities({
      actorUserId: "admin",
      actorRole: "admin",
      targetUserId: "owner",
      targetRole: "owner",
      activeOwnerCount: 1,
    }).canEditAccess,
    false,
  );
  assert.equal(canManageOrganizationTrash("admin"), true);

  const owner = getMeetingCapabilities("owner", null);
  assert.equal(owner.restoreMeeting, true);
  assert.equal(canManageOrganizationTrash("owner"), true);
  assert.deepEqual(
    getMemberAccessCapabilities({
      actorUserId: "owner",
      actorRole: "owner",
      targetUserId: "owner",
      targetRole: "owner",
      activeOwnerCount: 1,
    }).assignableOrganizationRoles,
    ["owner"],
  );
});

test("phase 1 migrations are ordered and own separate database contracts", async () => {
  const migrationNames = (await readdir(migrationsUrl))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const memberMigration = "202607240001_issue_18_member_access_management.sql";
  const trashMigration = "202607240002_issue_1_trash_restore_access.sql";

  assert.ok(migrationNames.indexOf(memberMigration) >= 0);
  assert.ok(
    migrationNames.indexOf(memberMigration) <
      migrationNames.indexOf(trashMigration),
  );

  const [memberSql, trashSql] = await Promise.all([
    readFile(new URL(memberMigration, migrationsUrl), "utf8"),
    readFile(new URL(trashMigration, migrationsUrl), "utf8"),
  ]);

  assert.match(memberSql, /update_organization_member_access/);
  assert.match(memberSql, /committee_members_manage_admin/);
  assert.doesNotMatch(memberSql, /enforce_organization_admin_trash_restore/);

  assert.match(trashSql, /enforce_organization_admin_trash_restore/);
  assert.doesNotMatch(trashSql, /update_organization_member_access/);
  assert.doesNotMatch(trashSql, /committee_members_manage_admin/);

  assert.match(memberSql, /create or replace function/i);
  assert.match(memberSql, /drop policy if exists/i);
  assert.match(trashSql, /create or replace function/i);
  assert.match(trashSql, /drop trigger if exists/i);
});
