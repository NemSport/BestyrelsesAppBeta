import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [meetingPage, minutes, header, dirtyGuard, pdf] = await Promise.all([
  source(
    "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/meetings/[meetingId]/page.tsx",
  ),
  source("../../src/components/meetings/meeting-minutes-section.tsx"),
  source("../../src/components/meetings/meeting-document-header.tsx"),
  source("../../src/lib/navigation-guard.ts"),
  source("../../src/lib/minutes-pdf.ts"),
]);

test("meeting workspace renders one active agenda item beside a compact desktop master list", () => {
  assert.match(minutes, /lg:grid-cols-\[minmax\(15rem,20rem\)_minmax\(0,1fr\)\]/);
  assert.match(minutes, /aria-label="Dagsordenspunkter"/);
  assert.match(minutes, /max-h-\[calc\(100vh-7rem\)\]/);
  assert.match(minutes, /overflow-y-auto/);
  assert.match(minutes, /aria-current=\{isActive \? "location" : undefined\}/);
  assert.match(minutes, /border-2 border-brand bg-brand-soft/);
  assert.match(minutes, /hidden=\{occurrence\.id !== activeOccurrence\.id\}/);
  assert.match(minutes, /aria-hidden=\{occurrence\.id !== activeOccurrence\.id\}/);
  assert.doesNotMatch(minutes, /agendaPointHash =/);
});

test("the active item is addressable and follows native hash history", () => {
  assert.match(minutes, /#agenda-point-\(\.\+\)\$/);
  assert.match(minutes, /window\.addEventListener\("hashchange"/);
  assert.match(minutes, /href=\{`#agenda-point-\$\{occurrence\.id\}`\}/);
  assert.match(minutes, /focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(minutes, /history\.(pushState|replaceState)/);
  assert.doesNotMatch(minutes, /router\.(push|replace)/);
});

test("mobile exposes current context, a modal selector, and previous/next links", () => {
  assert.match(minutes, /Punkt \{activeIndex \+ 1\} af \{occurrences\.length\}/);
  assert.match(minutes, /Vælg et andet punkt/);
  assert.match(minutes, /open=\{selectorOpen\}/);
  assert.match(minutes, /setSelectorOpen\(false\)/);
  assert.match(minutes, /← Forrige/);
  assert.match(minutes, /Næste →/);
  assert.match(minutes, /lg:hidden/);
});

test("point editing is opt-in and cards stay mounted to preserve local drafts", () => {
  assert.match(minutes, /const \[isEditingMinutes, setIsEditingMinutes\]/);
  assert.match(minutes, /canEdit && !isEditingMinutes/);
  assert.match(minutes, /Rediger referat/);
  assert.match(minutes, /canEdit && isEditingMinutes/);
  assert.match(minutes, /Tilføj beslutning/);
  assert.match(minutes, /Opret opgave/);
  assert.match(minutes, /Flere handlinger/);
  assert.match(minutes, /useDismissibleDetails\(moreActionsRef\)/);
  assert.match(minutes, /occurrences\.map\(\(occurrence, index\) => \(/);
  assert.match(minutes, /hidden=\{occurrence\.id !== activeOccurrence\.id\}/);
});

test("general minutes editor is absent while historical data contracts remain", () => {
  const currentComponent = minutes.slice(
    minutes.indexOf("export function MeetingMinutesSection"),
  );
  assert.doesNotMatch(currentComponent, /meeting-minutes-text/);
  assert.doesNotMatch(currentComponent, /Generelt mødereferat/);
  assert.match(currentComponent, /initialMeetingMinutes/);
  assert.match(currentComponent, /MinutesApprovalPanel/);
  assert.match(currentComponent, /general-minutes-heading/);
  assert.match(pdf, /agendaItemMinutes/);
  assert.match(pdf, /minutes_text/);
});

test("page keeps participants and capabilities but removes duplicate section navigation", () => {
  assert.match(header, /id="meeting-participants-heading"/);
  assert.match(meetingPage, /getMeetingCapabilities/);
  assert.match(meetingPage, /meetingCapabilities\.editOfficialMinutes/);
  assert.match(meetingPage, /meetingCapabilities\.editDecisions/);
  assert.match(meetingPage, /meetingCapabilities\.editTasks/);
  assert.doesNotMatch(meetingPage, /MeetingSectionNavigation/);
  assert.doesNotMatch(meetingPage, /meeting-related-work/);
});

test("hash-only navigation does not trigger the dirty-form leave guard", () => {
  assert.match(dirtyGuard, /targetUrl\.pathname === currentUrl\.pathname/);
  assert.match(dirtyGuard, /targetUrl\.search === currentUrl\.search/);
  assert.match(dirtyGuard, /hash-only change does not discard/);
});
