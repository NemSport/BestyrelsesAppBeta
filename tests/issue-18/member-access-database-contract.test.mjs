import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/202607240001_issue_18_member_access_management.sql",
    import.meta.url,
  ),
  "utf8",
);
const service = await readFile(
  new URL("../../src/services/organization-member-service.ts", import.meta.url),
  "utf8",
);
const client = await readFile(
  new URL(
    "../../src/components/members/member-administration.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("member access RPC is atomic and callable only through its protected contract", () => {
  assert.match(
    migration,
    /create or replace function public\.update_organization_member_access/,
  );
  assert.match(migration, /security definer/);
  assert.match(migration, /actor_role not in \('owner', 'admin'\)/);
  assert.match(
    migration,
    /grant execute on function public\.update_organization_member_access[\s\S]*to authenticated/,
  );
  assert.match(
    migration,
    /revoke execute on function public\.update_organization_member_role[\s\S]*from authenticated/,
  );
});

test("client and server use the shared member-access capability model", () => {
  assert.match(service, /import \{ getMemberAccessCapabilities \}/);
  assert.match(service, /const capabilities = getMemberAccessCapabilities/);
  assert.match(client, /import \{ getMemberAccessCapabilities \}/);
  assert.match(client, /const capabilities = getMemberAccessCapabilities/);
});

test("owner and administrator protections are enforced in PostgreSQL", () => {
  assert.match(
    migration,
    /target_user_id = auth\.uid\(\).*actor_role <> 'owner'/,
  );
  assert.match(
    migration,
    /\(current_role = 'owner' or new_role = 'owner'\).*actor_role <> 'owner'/,
  );
  assert.match(migration, /if owner_count <= 1/);
});

test("committee assignments reject duplicates and cross-tenant committees", () => {
  assert.match(
    migration,
    /count\(distinct \(assignment->>'committee_id'\)::uuid\)/,
  );
  assert.match(migration, /c\.organization_id = target_organization_id/);
  assert.match(migration, /c\.archived_at is null/);
  assert.match(migration, /c\.deleted_at is null/);
  assert.match(migration, /Det samme udvalg kan kun vælges én gang/);
  assert.match(
    migration,
    /Et eller flere udvalg blev ikke fundet i organisationen/,
  );
  assert.match(migration, /on conflict \(committee_id, user_id\)/);
  assert.match(migration, /role = excluded\.role/);
});

test("committee membership RLS follows the organization-admin service boundary", () => {
  assert.match(
    migration,
    /drop policy if exists committee_members_manage on public\.committee_members/,
  );
  assert.match(
    migration,
    /create policy committee_members_manage_admin[\s\S]*using \(public\.is_organization_admin\(organization_id\)\)/,
  );
  assert.doesNotMatch(
    migration.slice(
      migration.indexOf("create policy committee_members_manage_admin"),
    ),
    /can_manage_committee/,
  );
});
