import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [
  pageLayout,
  styles,
  meetingList,
  meetingOverview,
  agendaItem,
  actionCenter,
  organizationNav,
  appShell,
  documentRegister,
  stakeholderProfile,
  richTextEditor,
] = await Promise.all([
  source("../../src/components/ui/page-layout.tsx"),
  source("../../src/app/globals.css"),
  source("../../src/components/meetings/meeting-list.tsx"),
  source(
    "../../src/app/(app)/organizations/[organizationId]/meetings/page.tsx",
  ),
  source(
    "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/agenda-items/[agendaItemId]/page.tsx",
  ),
  source("../../src/components/actions/action-center.tsx"),
  source("../../src/components/layout/organization-nav.tsx"),
  source("../../src/components/layout/app-shell.tsx"),
  source("../../src/components/documents/document-register.tsx"),
  source("../../src/components/stakeholders/stakeholder-profile.tsx"),
  source("../../src/components/forms/rich-text-editor.tsx"),
]);

test("shared page headers wrap large action groups without collapsing the title", () => {
  assert.match(pageLayout, /min-w-0 flex-1 sm:basis-80/);
  assert.match(
    styles,
    /@media \(min-width: 640px\)[\s\S]*\.page-header \{[\s\S]*flex-wrap: wrap/,
  );
  assert.match(agendaItem, /<PageHeader[\s\S]*actions=\{/);
  assert.match(agendaItem, /Opret beslutning fra dette punkt/);
  assert.match(agendaItem, /Opret opgave fra dette punkt/);
});

test("meeting rows reserve readable title and metadata columns", () => {
  assert.match(
    meetingList,
    /lg:grid-cols-\[minmax\(12rem,1fr\)_minmax\(14rem,1\.4fr\)_auto_auto\]/,
  );
  assert.match(meetingList, /key="meeting-actions"/);
  assert.match(meetingList, /break-words text-base font-semibold/);
  assert.doesNotMatch(meetingList, /minmax\(15rem,auto\)/);
});

test("the authenticated shell exposes one main landmark per page", () => {
  assert.match(appShell, /<main className="page-shell">/);
  for (const nestedContent of [
    meetingOverview,
    documentRegister,
    stakeholderProfile,
  ]) {
    assert.doesNotMatch(nestedContent, /<main\b/);
  }
});

test("small consistency fixes retain readable counts and settings context", () => {
  assert.match(
    actionCenter,
    /className: "gap-1"[\s\S]*size: "sm"/,
  );
  assert.match(organizationNav, /pathname === `\$\{root\}\/edit`/);
  assert.match(organizationNav, /"Indstillinger"/);
  assert.match(organizationNav, /Aktuel side: <span>\{activeLabel\}<\/span>/);
});

test("rich text editor registers custom link and underline extensions once", () => {
  assert.match(
    richTextEditor,
    /StarterKit\.configure\(\{[\s\S]*link: false,[\s\S]*underline: false/,
  );
  assert.match(richTextEditor, /Link\.configure\(/);
  assert.match(richTextEditor, /\r?\n\s+Underline,\r?\n/);
});
