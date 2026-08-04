import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const emptyState = source("../../src/components/ui/empty-state.tsx");
const tasks = source("../../src/components/tasks/task-register.tsx");
const decisions = source(
  "../../src/components/decisions/decision-register.tsx",
);
const annualWheel = source(
  "../../src/components/annual-wheel/annual-wheel.tsx",
);
const jobCards = source("../../src/components/job-cards/job-card-register.tsx");
const members = source(
  "../../src/components/members/member-administration.tsx",
);
const minutes = source(
  "../../src/components/meetings/meeting-minutes-section.tsx",
);
const participants = source(
  "../../src/components/meetings/meeting-participants-panel.tsx",
);
const organizationDashboard = source(
  "../../src/components/dashboard/organization-dashboard-priority.tsx",
);
const committeeDashboard = source(
  "../../src/components/dashboard/committee-dashboard-priority.tsx",
);
const committeeMeetings = source(
  "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/meetings/page.tsx",
);
const trash = source("../../src/components/trash/organization-trash.tsx");
const trashDenied = source(
  "../../src/components/trash/trash-access-denied.tsx",
);
const loading = source(
  "../../src/app/(app)/organizations/[organizationId]/loading.tsx",
);
const error = source(
  "../../src/app/(app)/organizations/[organizationId]/error.tsx",
);

test("shared pattern distinguishes empty, filtered, read-only, and error states", () => {
  assert.match(emptyState, /"empty" \| "filtered" \| "read-only" \| "error"/);
  assert.match(emptyState, /data-empty-state=\{kind\}/);
  assert.match(emptyState, /kind === "filtered" \? "polite"/);
  assert.match(emptyState, /kind === "error" \? "alert"/);
  assert.match(emptyState, /action-cluster mt-4 justify-center/);
});

test("register no-results states reset filters before offering creation", () => {
  for (const register of [tasks, decisions]) {
    assert.match(register, /hasActiveFilters \? \(/);
    assert.match(register, /Nulstil filtre/);
    assert.match(register, /kind=\{[\s\S]*?hasActiveFilters\s*\?\s*"filtered"/);
  }
  assert.match(annualWheel, /Opret første aktivitet/);
  assert.match(
    annualWheel,
    /kind=\{[\s\S]*?hasActiveFilters\s*\?\s*"filtered"/,
  );
  assert.match(jobCards, /kind="filtered"/);
  assert.match(jobCards, /Ryd filtre/);
});

test("write CTAs remain guarded by existing capabilities", () => {
  assert.match(tasks, /canCreate \? \([\s\S]*Opret første opgave/);
  assert.match(decisions, /canCreate \? \([\s\S]*Opret fra dagsordenspunkt/);
  assert.match(annualWheel, /canCreate \? \([\s\S]*Opret første aktivitet/);
  assert.match(
    jobCards,
    /data\.canManage \? \([\s\S]*Opret det første jobkort/,
  );
  assert.match(
    committeeMeetings,
    /capabilities\.createMeeting \? \([\s\S]*Opret første møde/,
  );
  assert.doesNotMatch(emptyState, /organizationRole|committeeRole|owner|admin/);
});

test("minutes and participant guidance follows concrete edit capability", () => {
  assert.match(minutes, /canEdit\s*\? "Tag rollen som referent/);
  assert.match(
    minutes,
    /Du kan læse de officielle referatfelter\. En mødeansvarlig kan vælge referent og redigere\./,
  );
  assert.match(minutes, /kind=\{canEdit \? "empty" : "read-only"\}/);
  assert.match(
    participants,
    /Du kan se deltagerstatus\. En mødeansvarlig kan opdatere/,
  );
  assert.match(participants, /kind=\{canEdit \? "empty" : "read-only"\}/);
});

test("read destinations are concrete while forbidden editor CTAs stay absent", () => {
  assert.match(organizationDashboard, /Se kommende møder/);
  assert.match(organizationDashboard, /Opret første udvalg/);
  assert.match(committeeDashboard, /Se mine opgaver/);
  assert.match(committeeDashboard, /Se beslutningsregister/);
  assert.match(members, /canManage \? \([\s\S]*Inviter medlem/);
  assert.match(trash, /Tilbage til overblik/);
  assert.match(trashDenied, /Kontakt en administrator/);
  assert.doesNotMatch(trashDenied, /Gendan<|onClick=.*restore/);
});

test("loading and errors are not presented as empty data", () => {
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /animate-pulse/);
  assert.doesNotMatch(loading, /EmptyState/);
  assert.match(error, /role="alert"/);
  assert.match(error, /reset/);
  assert.doesNotMatch(error, /EmptyState/);
});

test("presentation change introduces no data or authorization layer", () => {
  assert.doesNotMatch(emptyState, /fetch\(|createClient|Service|Repository/);
  assert.doesNotMatch(
    [tasks, decisions, annualWheel, jobCards, members].join("\n"),
    /organizationRole\s*===\s*"viewer"|committeeRole\s*===\s*"member"/,
  );
});
