import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFile(path.join(root, file), "utf8");

test("core migration defines tenant-safe stakeholder aggregates, indexes and RLS", async () => {
  const sql = await read(
    "supabase/migrations/202608250001_stakeholder_core.sql",
  );
  for (const table of [
    "stakeholders",
    "stakeholder_contacts",
    "stakeholder_contracts",
    "stakeholder_contract_deliverables",
    "stakeholder_activities",
    "stakeholder_pipeline_entries",
    "stakeholder_pipeline_events",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
  }
  assert.match(sql, /unique \(organization_id, id\)/);
  assert.match(sql, /foreign key \(organization_id, stakeholder_id\)/);
  assert.match(sql, /numeric\(14, 2\)/);
  assert.match(sql, /can_manage_stakeholder_data/);
  assert.match(sql, /is_organization_member\(organization_id\)/);
  assert.match(sql, /validate_stakeholder_activity_scope/);
  assert.doesNotMatch(sql, /create policy[\s\S]{0,100}for delete/i);
});

test("pipeline stage change is atomic and creates both history and a system activity", async () => {
  const sql = await read(
    "supabase/migrations/202608250001_stakeholder_core.sql",
  );
  const rpc = sql.slice(
    sql.indexOf(
      "create or replace function public.update_stakeholder_pipeline_stage",
    ),
  );
  assert.match(rpc, /insert into public\.stakeholder_pipeline_events/);
  assert.match(rpc, /insert into public\.stakeholder_activities/);
  assert.match(rpc, /'pipeline_change'/);
  assert.match(sql, /stakeholder_pipeline_one_open_idx/);
  assert.match(sql, /Pipeline-fase skal ændres gennem det atomiske workflow/);
});

test("tasks and documents extend their canonical systems instead of creating duplicates", async () => {
  const [sql, taskRepository, documentService] = await Promise.all([
    read("supabase/migrations/202608250002_stakeholder_integrations.sql"),
    read("src/repositories/task-repository.ts"),
    read("src/services/document-service.ts"),
  ]);
  assert.match(sql, /alter table public\.tasks[\s\S]*stakeholder_id/);
  assert.match(
    sql,
    /alter table public\.document_relations[\s\S]*stakeholder_contract_id/,
  );
  assert.doesNotMatch(sql, /create table public\.stakeholder_tasks/);
  assert.doesNotMatch(sql, /create table public\.stakeholder_documents/);
  assert.match(taskRepository, /listByStakeholder/);
  assert.match(documentService, /stakeholder_contract/);
});

test("API, search and action integrations use the shared services", async () => {
  const [route, search, action, nav] = await Promise.all([
    read("src/app/api/organizations/[organizationId]/stakeholders/route.ts"),
    read("src/services/global-search-service.ts"),
    read("src/services/action-service.ts"),
    read("src/lib/organization-navigation.ts"),
  ]);
  assert.match(route, /new StakeholderService/);
  assert.match(search, /type: "stakeholders" as const/);
  assert.match(search, /stakeholderContactRows/);
  assert.match(action, /deriveStakeholderActions/);
  assert.match(nav, /Interessenter & Relationer/);
});

test("responsive workspace and profile expose empty, loading and read-only-safe states", async () => {
  const [workspace, profile, loading, error] = await Promise.all([
    read("src/components/stakeholders/stakeholder-workspace.tsx"),
    read("src/components/stakeholders/stakeholder-profile.tsx"),
    read(
      "src/app/(app)/organizations/[organizationId]/stakeholders/loading.tsx",
    ),
    read("src/app/(app)/organizations/[organizationId]/stakeholders/error.tsx"),
  ]);
  assert.match(workspace, /sm:grid-cols-2/);
  assert.match(workspace, /Der er ingen interessenter endnu/);
  assert.match(workspace, /capabilities\.createStakeholders/);
  assert.match(profile, /Ingen aktive kontrakter/);
  assert.match(profile, /Ingen aktiviteter registreret endnu/);
  assert.match(profile, /Ingen opgaver knyttet til relationen/);
  assert.match(profile, /capabilities\.manageContracts/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(error, /role="alert"/);
});
