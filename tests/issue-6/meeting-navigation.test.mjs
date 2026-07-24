import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [navigation, meetingPage, minutes, header, dirtyGuard] =
  await Promise.all([
    source(
      "../../src/components/meetings/meeting-section-navigation.tsx",
    ),
    source(
      "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/meetings/[meetingId]/page.tsx",
    ),
    source("../../src/components/meetings/meeting-minutes-section.tsx"),
    source("../../src/components/meetings/meeting-document-header.tsx"),
    source("../../src/lib/navigation-guard.ts"),
  ]);

test("meeting navigation is compact, native, and focus-aware", () => {
  assert.match(navigation, /aria-label="Gå til sektion i mødet"/);
  assert.match(navigation, /href=\{`#\$\{section\.id\}`\}/);
  assert.match(navigation, /min-h-11/);
  assert.match(navigation, /overflow-x-auto/);
  assert.doesNotMatch(navigation, /\bsticky\b|\bfixed\b/);
  assert.match(navigation, /aria-current=/);
  assert.match(navigation, /focus\(\{ preventScroll: true \}\)/);
  assert.match(navigation, /scrollIntoView\(\{ block: "start" \}\)/);
});

test("deep links open disclosures and follow browser history", () => {
  assert.match(
    navigation,
    /target\.closest<HTMLDetailsElement>\("details"\)/,
  );
  assert.match(navigation, /disclosure\.open = true/);
  assert.match(navigation, /target\.tagName === "DETAILS"/);
  assert.match(navigation, /window\.addEventListener\("hashchange"/);
  assert.doesNotMatch(navigation, /preventDefault/);
  assert.doesNotMatch(navigation, /router\.(push|replace)/);
});

test("agenda point and general minutes state synchronize with hashes", () => {
  assert.match(minutes, /agendaPointHash = `#agenda-point-\$\{occurrence\.id\}`/);
  assert.match(minutes, /window\.location\.hash === agendaPointHash/);
  assert.match(minutes, /openDeepLinkedPoint/);
  assert.match(minutes, /"#general-minutes-heading"/);
  assert.match(minutes, /openDeepLinkedGeneralMinutes/);
  assert.match(minutes, /window\.addEventListener\("hashchange"/g);
  assert.match(minutes, /id="agenda-minutes-heading"[\s\S]*tabIndex=\{-1\}/);
  assert.match(minutes, /id="general-minutes-heading"[\s\S]*tabIndex=\{-1\}/);
});

test("server-rendered section links reflect relevant authorized data", () => {
  assert.match(meetingPage, /getMeetingCapabilities/);
  assert.match(meetingPage, /id: "meeting-participants-heading"/);
  assert.match(meetingPage, /id: "agenda-minutes-heading"/);
  assert.match(meetingPage, /id: "general-minutes-heading"/);
  assert.match(
    meetingPage,
    /decisionContext\.decisions\.length > 0[\s\S]*meeting-decisions-heading/,
  );
  assert.match(
    meetingPage,
    /taskContext\.tasks\.length > 0[\s\S]*meeting-tasks-heading/,
  );
  assert.match(meetingPage, /meetingCapabilities\.editDecisions/);
  assert.match(meetingPage, /meetingCapabilities\.editTasks/);
});

test("participants and related work expose stable semantic targets", () => {
  assert.match(header, /id="meeting-participants-heading"/);
  assert.match(header, /tabIndex=\{-1\}/);
  assert.match(meetingPage, /id="meeting-related-work"/);
  assert.match(meetingPage, /aria-labelledby="meeting-decisions-heading"/);
  assert.match(meetingPage, /aria-labelledby="meeting-tasks-heading"/);
  assert.match(meetingPage, /id="meeting-decisions-heading"/);
  assert.match(meetingPage, /id="meeting-tasks-heading"/);
});

test("hash-only navigation does not trigger the dirty-form leave guard", () => {
  assert.match(dirtyGuard, /targetUrl\.pathname === currentUrl\.pathname/);
  assert.match(dirtyGuard, /targetUrl\.search === currentUrl\.search/);
  assert.match(dirtyGuard, /hash-only change does not discard/);
});
