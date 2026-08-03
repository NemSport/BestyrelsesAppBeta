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
  assert.match(dashboard, /interactiveSurfaceClassName\("p-4"\)/);
  assert.match(dashboard, /SurfaceLinkCue label="Åbn møde"/);
});

test("rows with separate actions stay static and expose explicit primary links", () => {
  for (const module of [meetingList, committees, dashboard]) {
    assert.match(module, /staticSurfaceClassName/);
    assert.match(module, /primarySurfaceLinkClassName/);
  }
  assert.match(organizationMeetings, /<MeetingList/);
  assert.match(committeeMeetings, /<MeetingList/);
  assert.doesNotMatch(meetingList, /<article[^>]+onClick=/);
  assert.doesNotMatch(committees, /<article[^>]+onClick=/);
  assert.doesNotMatch(table, /hover:bg-subtle/);
});

test("nested register actions remain outside parent navigation and read-only is explicit", () => {
  for (const register of [tasks, decisions]) {
    assert.match(register, /staticSurfaceClassName/);
    assert.match(register, />Skrivebeskyttet</);
    assert.doesNotMatch(register, /<article[^>]+onClick=/);
  }
  assert.match(tasks, /<ActionMenu label="Handlinger">/);
  assert.match(tasks, /if \(!canEdit\) return null/);
  assert.match(decisions, /\{canEdit \? \(/);
});

test("small actions and menus meet the shared 44px touch target", () => {
  assert.match(buttons, /min-h-11/);
  assert.match(actionMenu, /min-h-11/);
  assert.match(surfaces, /min-h-11/);
});
