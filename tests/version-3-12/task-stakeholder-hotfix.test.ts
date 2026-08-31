import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { reconcileTaskStakeholderContract } from "../../src/lib/task-stakeholder-context";
import { taskInputSchema } from "../../src/lib/validation";

const root = process.cwd();
const read = (file: string) => readFile(path.join(root, file), "utf8");

const organizationId = "11111111-1111-4111-8111-111111111111";
const committeeId = "22222222-2222-4222-8222-222222222222";
const stakeholderId = "33333333-3333-4333-8333-333333333333";
const otherStakeholderId = "44444444-4444-4444-8444-444444444444";
const contractId = "55555555-5555-4555-8555-555555555555";

const contracts = [
  {
    id: contractId,
    stakeholder_id: stakeholderId,
    title: "Sponsoraftale 2026",
  },
];

test("task input keeps stakeholder optional and accepts canonical stakeholder context", () => {
  const base = {
    organizationId,
    committeeId,
    title: "Følg op",
    description: "",
    status: "not_started" as const,
  };
  assert.equal(taskInputSchema.parse(base).stakeholderId, undefined);
  assert.deepEqual(
    taskInputSchema.parse({
      ...base,
      stakeholderId,
      stakeholderContractId: contractId,
    }).stakeholderContractId,
    contractId,
  );
});

test("changing or removing stakeholder clears a contract that no longer belongs", () => {
  assert.equal(
    reconcileTaskStakeholderContract(stakeholderId, contractId, contracts),
    contractId,
  );
  assert.equal(
    reconcileTaskStakeholderContract(otherStakeholderId, contractId, contracts),
    "",
  );
  assert.equal(reconcileTaskStakeholderContract("", contractId, contracts), "");
});

test("stakeholder profile reuses the canonical create and detail modals without task navigation", async () => {
  const profile = await read(
    "src/components/stakeholders/stakeholder-profile.tsx",
  );
  assert.match(profile, /<TaskCreateModal/);
  assert.match(profile, /initialStakeholderId=\{stakeholder\.id\}/);
  assert.match(profile, /initialStakeholderContractId=\{contract\.id\}/);
  assert.match(profile, /<TaskDetailModal/);
  assert.match(profile, /router\.refresh\(\)/);
  assert.match(profile, /setTasks\(data\.tasks\)/);
  assert.doesNotMatch(
    profile,
    /href=\{`\/organizations\/\$\{organizationId\}\/tasks\?/,
  );
});

test("Tasks V2 create and edit expose scoped stakeholder and contract selectors", async () => {
  const [register, createModal, detail] = await Promise.all([
    read("src/components/tasks/task-register.tsx"),
    read("src/components/tasks/task-create-modal.tsx"),
    read("src/components/tasks/task-detail-modal.tsx"),
  ]);
  for (const source of [register, createModal, detail]) {
    assert.match(source, />\s*Interessent\s*</);
    assert.match(source, />\s*Kontrakt\s*</);
    assert.match(source, /reconcileTaskStakeholderContract/);
  }
  assert.match(register, /data\.stakeholders\.map/);
  assert.match(register, /contract\.stakeholder_id ===/);
  assert.match(detail, /stakeholderContractId: draft\.stakeholderContractId/);
});

test("service and database reject cross-organization or mismatched relations", async () => {
  const [service, migration, repository] = await Promise.all([
    read("src/services/task-service.ts"),
    read("supabase/migrations/202608250002_stakeholder_integrations.sql"),
    read("src/repositories/task-repository.ts"),
  ]);
  assert.match(
    service,
    /stakeholder\.organization_id !== input\.organizationId/,
  );
  assert.match(
    service,
    /stakeholderContract\.organization_id !== input\.organizationId/,
  );
  assert.match(
    service,
    /stakeholderContract\.stakeholder_id !== input\.stakeholderId/,
  );
  assert.match(service, /stakeholderContract\.archived_at/);
  assert.match(
    migration,
    /foreign key \(organization_id, stakeholder_id\)[\s\S]*references public\.stakeholders\(organization_id, id\)/,
  );
  assert.match(
    migration,
    /foreign key \(organization_id, stakeholder_contract_id\)[\s\S]*references public\.stakeholder_contracts\(organization_id, id\)/,
  );
  assert.match(
    migration,
    /c\.stakeholder_id = new\.stakeholder_id[\s\S]*Task stakeholder contract scope is invalid/,
  );
  assert.match(repository, /stakeholder:stakeholders/);
  assert.match(repository, /stakeholderContract:stakeholder_contracts/);
});

test("profile and Tasks V2 read the same canonical task rows with permission-gated controls", async () => {
  const [profile, stakeholderService, taskRepository, register] =
    await Promise.all([
      read("src/components/stakeholders/stakeholder-profile.tsx"),
      read("src/services/stakeholder-service.ts"),
      read("src/repositories/task-repository.ts"),
      read("src/components/tasks/task-register.tsx"),
    ]);
  assert.match(stakeholderService, /this\.tasks\.listByStakeholder/);
  assert.match(
    taskRepository,
    /\.from\("tasks"\)[\s\S]*\.eq\("stakeholder_id", stakeholderId\)/,
  );
  assert.match(profile, /committeeOptions\.length \? \(/);
  assert.match(profile, /canEdit=\{data\.editableCommitteeIds\.includes/);
  assert.match(register, /Interessent: \$\{task\.stakeholder\.name\}/);
  assert.doesNotMatch(
    await read("supabase/migrations/202608250002_stakeholder_integrations.sql"),
    /create table public\.stakeholder_tasks/,
  );
});
