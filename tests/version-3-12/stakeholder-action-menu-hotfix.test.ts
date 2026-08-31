import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFile(path.join(root, file), "utf8");

test("shared action menu uses a real controlled button trigger", async () => {
  const menu = await read("src/components/ui/action-menu.tsx");
  assert.match(menu, /<button/);
  assert.match(menu, /type="button"/);
  assert.match(menu, /aria-expanded=\{open\}/);
  assert.match(menu, /aria-controls=\{panelId\}/);
  assert.match(menu, /onClick=\{\(\) => setOpen/);
  assert.match(menu, /\{open \? \(/);
  assert.doesNotMatch(menu, /<summary/);
});

test("action menu isolates card events and supports outside-click and Escape dismissal", async () => {
  const menu = await read("src/components/ui/action-menu.tsx");
  assert.match(menu, /event\.stopPropagation\(\)/);
  assert.match(menu, /document\.addEventListener\("pointerdown"/);
  assert.match(menu, /document\.addEventListener\("keydown"/);
  assert.match(menu, /event\.key !== "Escape"/);
  assert.match(menu, /triggerRef\.current\?\.focus\(\)/);
  assert.match(menu, /z-\[70\]/);
  assert.match(menu, /\[&>a\]:min-h-11/);
  assert.match(menu, /\[&>button\]:min-h-11/);
});

test("mobile stakeholder card exposes an unclipped isolated menu without whole-card navigation", async () => {
  const workspace = await read(
    "src/components/stakeholders/stakeholder-workspace.tsx",
  );
  assert.match(workspace, /overflow-visible/);
  assert.match(workspace, /<ActionMenu/);
  assert.match(workspace, /ariaLabel=\{`Handlinger for/);
  assert.match(workspace, /absolute right-2 top-1\.5 md:static/);
  assert.match(workspace, /size-11 min-h-11/);
  assert.doesNotMatch(workspace, /<article[^>]+onClick=/);
  assert.match(
    workspace,
    /<Link[\s\S]*href=\{`\/organizations\/\$\{organizationId\}\/stakeholders\/\$\{item\.id\}`\}/,
  );
});

test("desktop positioning and permission-gated archive action remain intact", async () => {
  const [workspace, profile] = await Promise.all([
    read("src/components/stakeholders/stakeholder-workspace.tsx"),
    read("src/components/stakeholders/stakeholder-profile.tsx"),
  ]);
  assert.match(workspace, /md:static/);
  assert.match(workspace, /data\.capabilities\.archiveStakeholders/);
  assert.match(workspace, />\s*Arkivér\s*</);
  assert.match(profile, /<ActionMenu label="Flere handlinger">/);
  assert.match(profile, /data\.capabilities\.updateStakeholders/);
});
