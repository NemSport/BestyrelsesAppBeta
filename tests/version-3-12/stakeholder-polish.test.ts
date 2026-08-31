import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFile(path.join(root, file), "utf8");

test("stakeholder module uses readable secondary eyebrows and removes permanent onboarding", async () => {
  const [page, workspace] = await Promise.all([
    read("src/app/(app)/organizations/[organizationId]/stakeholders/page.tsx"),
    read("src/components/stakeholders/stakeholder-workspace.tsx"),
  ]);
  assert.match(page, /Eksterne relationer/);
  assert.match(page, /text-muted/);
  assert.match(workspace, /page-eyebrow text-muted/);
  assert.doesNotMatch(workspace, /Sådan bruges modulet/);
  assert.doesNotMatch(workspace, /CRM-opfølgninger bruges/);
});

test("mobile register keeps search visible and moves advanced filters into the shared sheet", async () => {
  const workspace = await read(
    "src/components/stakeholders/stakeholder-workspace.tsx",
  );
  assert.match(workspace, /const \[filtersOpen, setFiltersOpen\]/);
  assert.match(workspace, /sm:hidden/);
  assert.match(workspace, /Åbn filtre/);
  assert.match(workspace, /activeFilterCount/);
  assert.match(workspace, /title="Filtrer interessenter"/);
  assert.match(workspace, /placement="right"/);
  assert.match(workspace, /Vis \{visible\.length\} resultater/);
  assert.match(workspace, /function resetFilters\(\)/);
  for (const reset of [
    "setSearch",
    "setType",
    "setStatus",
    "setOwnerId",
    "setContract",
    "setFollowUp",
    "setSort",
  ]) {
    assert.match(workspace, new RegExp(`${reset}\\(`));
  }
});

test("mobile cards, KPI rows, pipeline and deadlines use compact wrapping layouts", async () => {
  const workspace = await read(
    "src/components/stakeholders/stakeholder-workspace.tsx",
  );
  assert.match(workspace, /p-2\.5 sm:p-3/);
  assert.match(workspace, /grid min-w-0 grid-cols-2/);
  assert.match(workspace, /md:hidden/);
  assert.match(workspace, /md:grid-cols-\[minmax\(14rem/);
  assert.match(workspace, /size-11 min-h-11/);
  assert.match(workspace, /px-2 py-1\.5 text-xs text-muted/);
  assert.match(workspace, /flex flex-col items-start gap-1/);
  assert.match(workspace, /min-w-0 break-words font-medium/);
});

test("stakeholder profile protects narrow content and retains permission-gated controls", async () => {
  const profile = await read(
    "src/components/stakeholders/stakeholder-profile.tsx",
  );
  assert.match(profile, /min-w-0 space-y-5 sm:space-y-6/);
  assert.match(profile, /page-title break-words/);
  assert.match(profile, /grid grid-cols-2 gap-3/);
  assert.match(profile, /break-all text-sm text-brand/);
  assert.match(profile, /max-w-24 shrink-0 truncate/);
  assert.match(profile, /data\.capabilities\.manageContracts/);
  assert.match(profile, /data\.capabilities\.manageContacts/);
  assert.match(profile, /data\.capabilities\.addActivities/);
  assert.match(profile, /committeeOptions\.length/);
});

test("task stakeholder fields remain in the shared responsive modals", async () => {
  const [createModal, detailModal] = await Promise.all([
    read("src/components/tasks/task-create-modal.tsx"),
    read("src/components/tasks/task-detail-modal.tsx"),
  ]);
  assert.match(createModal, /task-stakeholder-/);
  assert.match(createModal, /task-stakeholder-contract-/);
  assert.match(createModal, /flex flex-wrap justify-end gap-2/);
  assert.match(detailModal, /related-task-stakeholder-/);
  assert.match(detailModal, /related-task-contract-/);
  assert.match(detailModal, /overflow-x-hidden/);
});
