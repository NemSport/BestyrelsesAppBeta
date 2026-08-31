import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [
  surfaces,
  agendaItems,
  organizationMeetings,
  committeeMeetings,
  meetingList,
  committees,
  dashboard,
  tasks,
  taskDetail,
  decisions,
  table,
  buttons,
  actionMenu,
] = await Promise.all([
  source("../../src/components/ui/surface.tsx"),
  source(
    "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/agenda-items/page.tsx",
  ),
  source(
    "../../src/app/(app)/organizations/[organizationId]/meetings/page.tsx",
  ),
  source(
    "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/meetings/page.tsx",
  ),
  source("../../src/components/meetings/meeting-list.tsx"),
  source(
    "../../src/app/(app)/organizations/[organizationId]/committees/page.tsx",
  ),
  source("../../src/app/(app)/organizations/[organizationId]/page.tsx"),
  source("../../src/components/tasks/task-register.tsx"),
  source("../../src/components/tasks/task-register-detail.tsx"),
  source("../../src/components/decisions/decision-register.tsx"),
  source("../../src/components/ui/table.tsx"),
  source("../../src/components/ui/button.tsx"),
  source("../../src/components/ui/action-menu.tsx"),
]);

test("shared surface patterns distinguish links from static content without color alone", () => {
  assert.match(surfaces, /interactiveSurfaceClassName/);
  assert.match(surfaces, /cursor-pointer/);
  assert.match(surfaces, /touch-manipulation/);
  assert.match(surfaces, /hover:-translate-y-0\.5/);
  assert.match(surfaces, /active:translate-y-0/);
  assert.match(surfaces, /decoration-2/);
  assert.match(surfaces, /after:content-\['→'\]/);
  assert.match(surfaces, /SurfaceLinkCue/);
  assert.doesNotMatch(surfaces, /role=|tabIndex=/);
});

test("true full-card destinations use the interactive surface and a persistent cue", () => {
  assert.match(agendaItems, /interactiveSurfaceClassName\("p-5"\)/);
  assert.match(agendaItems, /SurfaceLinkCue label="Åbn dagsordenspunkt"/);
  assert.match(committees, /interactiveSurfaceClassName/);
  assert.match(
    committees,
    /aria-label=\{`Åbn arbejdsrummet \$\{item\.committee\.name\}`\}/,
  );
  assert.match(dashboard, /staticSurfaceClassName/);
  assert.match(dashboard, /focus-visible:ring-brand/);
  assert.match(dashboard, /aria-hidden="true"/);
});

test("rows with separate actions stay static and expose explicit primary links", () => {
  assert.match(meetingList, /staticSurfaceClassName/);
  assert.match(meetingList, /primarySurfaceLinkClassName/);
  assert.match(dashboard, /group grid min-h-11/);
  assert.match(organizationMeetings, /<MeetingList/);
  assert.match(committeeMeetings, /<MeetingList/);
  assert.doesNotMatch(meetingList, /<article[^>]+onClick=/);
  assert.doesNotMatch(committees, /<article[^>]+onClick=/);
  assert.doesNotMatch(committees, /<Link[\s\S]*?<button/);
  assert.doesNotMatch(table, /hover:bg-subtle/);
});

test("nested register actions remain outside parent navigation and read-only is explicit", () => {
  for (const register of [tasks, decisions]) {
    assert.match(register, /staticSurfaceClassName/);
    assert.doesNotMatch(register, /<article[^>]+onClick=/);
  }
  assert.match(taskDetail, />Skrivebeskyttet</);
  assert.match(decisions, />Skrivebeskyttet</);
  assert.match(tasks, /<ActionMenu[\s\S]*ariaLabel=\{`Handlinger for/);
  assert.match(tasks, /if \(!canEdit\) return null/);
  assert.match(decisions, /\{canEdit \? \(/);
});

test("small actions and menus meet the shared 44px touch target", () => {
  assert.match(buttons, /min-h-11/);
  assert.match(actionMenu, /min-h-11/);
  assert.match(surfaces, /min-h-11/);
});
