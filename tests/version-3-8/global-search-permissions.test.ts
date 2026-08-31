import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const source = (path: string) => readFileSync(`${root}/${path}`, "utf8");

const phaseOne = source("supabase/migrations/202606110001_phase_one.sql");
const minutes = source("supabase/migrations/202606120002_meeting_minutes.sql");
const decisions = source("supabase/migrations/202606130002_decision_register_foundation.sql");
const tasks = source("supabase/migrations/202606140001_task_foundation.sql");
const annualWheel = source("supabase/migrations/202606150003_annual_wheel_foundation.sql");
const documents = source("supabase/migrations/202608140001_documents_v2.sql");
const repository = source("src/repositories/global-search-repository.ts");
const service = source("src/services/global-search-service.ts");
const route = source("src/app/api/organizations/[organizationId]/search/route.ts");
const serverClient = source("src/lib/supabase/server.ts");

function policyAllowsCommittee(
  committeeIds: ReadonlySet<string>,
  committeeId: string,
  organizationAdmin = false,
) {
  return organizationAdmin || committeeIds.has(committeeId);
}

test("committee isolation contract models user A and user B for the unique sponsor fixture", () => {
  const board = "Bestyrelsen";
  const sponsor = "Sponsorudvalget";
  const userA = new Set([board, sponsor]);
  const userB = new Set([board]);
  const fixture = { committeeId: sponsor, text: "SUPERHEMMELIGSPONSORTEST" };

  assert.equal(policyAllowsCommittee(userA, fixture.committeeId), true);
  assert.equal(policyAllowsCommittee(userB, fixture.committeeId), false);

  for (const policy of [
    phaseOne.match(/create policy meetings_select_member[\s\S]*?;/)?.[0] ?? "",
    phaseOne.match(/create policy agenda_items_select_member[\s\S]*?;/)?.[0] ?? "",
    decisions.match(/create policy decisions_select_member[\s\S]*?;/)?.[0] ?? "",
    tasks.match(/create policy tasks_select_member[\s\S]*?;/)?.[0] ?? "",
  ]) {
    assert.match(policy, /is_committee_member\(committee_id\)/);
  }
});

test("every searched datatype has its normal RLS access mechanism in addition to organization scope", () => {
  assert.match(phaseOne, /meetings_select_member[\s\S]*is_committee_member\(committee_id\)/);
  assert.match(phaseOne, /agenda_items_select_member[\s\S]*is_committee_member\(committee_id\)/);
  assert.match(minutes, /meeting_minutes_select_authorized[\s\S]*can_read_meeting_minutes\(committee_id, status\)/);
  assert.match(minutes, /agenda_item_minutes_select_authorized[\s\S]*can_read_agenda_item_minutes\(committee_id, meeting_id\)/);
  assert.match(decisions, /decisions_select_member[\s\S]*is_committee_member\(committee_id\)/);
  assert.match(tasks, /tasks_select_member[\s\S]*is_committee_member\(committee_id\)/);
  assert.match(annualWheel, /annual_wheel_events_select_member[\s\S]*committee_id is null[\s\S]*is_committee_member\(committee_id\)/);
  assert.match(documents, /documents_read[\s\S]*can_read_document\(id\)/);
  assert.match(documents, /relation_type = 'committee'[\s\S]*is_committee_member\(r\.committee_id\)/);
});

test("search uses the authenticated anon client and never bypasses RLS", () => {
  assert.match(route, /createClient\(\)/);
  assert.match(serverClient, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(`${route}\n${service}\n${repository}`, /service_role|createAdminClient|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(service, /requireOrganizationMember\(input\.organizationId, user\.id\)/);
});

test("private and internal fields are absent from repository, service and API response path", () => {
  const searchPath = `${repository}\n${service}\n${route}`;
  assert.doesNotMatch(searchPath, /agenda_item_private_notes|private_note|internal_note/);
  assert.doesNotMatch(repository, /context_chunks|embeddings?|vectors?|openai/i);
  assert.doesNotMatch(service, /context_chunks|embeddings?|vectors?|openai/i);
});

test("document search stays on Documents V2 metadata and its existing detail route", () => {
  assert.match(repository, /\.from\("documents"\)/);
  assert.match(repository, /primaryCommittee:committees!documents_primary_committee_id_fkey/);
  assert.doesNotMatch(repository, /meeting_minute_attachments|agenda_item_minute_attachments/);
  assert.match(service, /type: "document"/);
});
