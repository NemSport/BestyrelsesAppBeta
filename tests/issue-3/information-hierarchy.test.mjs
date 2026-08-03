import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const css = source("../../src/app/globals.css");
const pageLayout = source("../../src/components/ui/page-layout.tsx");
const statusBadge = source("../../src/components/ui/status-badge.tsx");
const dashboardPriority = source(
  "../../src/components/dashboard/dashboard-priority-panel.tsx",
);
const meetingHeader = source(
  "../../src/components/meetings/meeting-document-header.tsx",
);
const meetingPage = source(
  "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/meetings/[meetingId]/page.tsx",
);
const committeePage = source(
  "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/page.tsx",
);
const taskRegister = source("../../src/components/tasks/task-register.tsx");
const decisionRegister = source(
  "../../src/components/decisions/decision-register.tsx",
);
const memberAdministration = source(
  "../../src/components/members/member-administration.tsx",
);
const annualWheel = source(
  "../../src/components/annual-wheel/annual-wheel.tsx",
);
const jobCards = source("../../src/components/job-cards/job-card-register.tsx");

const registerPages = [
  "decisions",
  "tasks",
  "members",
  "annual-wheel",
  "job-cards",
].map((route) =>
  source(
    `../../src/app/(app)/organizations/[organizationId]/${route}/page.tsx`,
  ),
);

test("shared page and section hierarchy owns titles, descriptions, and actions", () => {
  assert.match(pageLayout, /className=\{clsx\(\s*"page-header"/);
  assert.match(pageLayout, /className="page-actions"/);
  assert.match(pageLayout, /className="section-header"/);
  assert.match(pageLayout, /className="section-actions"/);
  assert.match(css, /\.page-title\s*\{/);
  assert.match(css, /\.section-title\s*\{/);
  assert.match(css, /\.supporting-text\s*\{/);
  assert.ok(registerPages.every((page) => /className="page-flow"/.test(page)));
});

test("representative routes share calm surface and metadata patterns", () => {
  assert.match(dashboardPriority, /section-header/);
  assert.match(meetingHeader, /page-title/);
  assert.match(meetingHeader, /supporting-text/);
  assert.match(meetingPage, /metric-strip/);
  assert.match(committeePage, /metric-strip/);
  assert.match(taskRegister, /register-summary-bar/);
  assert.match(decisionRegister, /entity-header/);
  assert.match(decisionRegister, /entity-metadata-grid/);
  assert.match(memberAdministration, /workflow-panel/);
  assert.match(memberAdministration, /entity-record/);
  assert.match(annualWheel, /filter-result-bar/);
  assert.match(jobCards, /module-filter-surface/);
  assert.match(jobCards, /entity-record/);
});

test("mobile keeps semantic order without hiding summary metrics", () => {
  assert.match(css, /\.page-header[\s\S]*flex-direction: column/);
  assert.match(css, /\.metric-strip[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(
    taskRegister,
    /grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5/,
  );
  assert.doesNotMatch(
    taskRegister,
    /-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid/,
  );
  assert.match(
    annualWheel,
    /grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4/,
  );
  assert.match(jobCards, /grid grid-cols-2 gap-3/);
});

test("focus, contrast semantics, and textual statuses remain intact", () => {
  assert.match(css, /:focus-visible\s*\{/);
  assert.match(css, /outline: 3px solid rgb\(var\(--brand-accent\)\)/);
  assert.match(statusBadge, /HTMLAttributes<HTMLSpanElement>/);
  assert.doesNotMatch(statusBadge, /aria-hidden/);
  assert.match(taskRegister, /taskStatusLabels\[task\.status\]/);
  assert.match(decisionRegister, /decisionStatusLabels\[decision\.status\]/);
  assert.match(meetingHeader, /meetingStatusLabels\[meeting\.status\]/);
});

test("presentation changes keep capability gates and URL state contracts", () => {
  assert.match(taskRegister, /\{canCreate \? \(/);
  assert.match(decisionRegister, /data\.editableCommitteeIds/);
  assert.match(memberAdministration, /getMemberAccessCapabilities/);
  assert.match(annualWheel, /replaceAnnualWheelState/);
  assert.match(annualWheel, /\{canCreate \? \(/);
  assert.match(jobCards, /\{data\.canManage \? \(/);
  assert.doesNotMatch(
    [css, pageLayout, statusBadge, dashboardPriority, meetingHeader].join("\n"),
    /fetch\(|\.from\(|\.rpc\(/,
  );
});
