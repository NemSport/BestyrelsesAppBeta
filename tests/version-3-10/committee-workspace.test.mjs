import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = source(
  "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/page.tsx",
);
const service = source("../../src/services/committee-service.ts");
const taskRepository = source("../../src/repositories/task-repository.ts");
const meetingRepository = source(
  "../../src/repositories/meeting-repository.ts",
);
const documentRepository = source(
  "../../src/repositories/document-repository.ts",
);
const annualWheelRepository = source(
  "../../src/repositories/annual-wheel-repository.ts",
);
const documentRegister = source(
  "../../src/components/documents/document-register.tsx",
);
const taskRegister = source("../../src/components/tasks/task-register.tsx");
const annualWheel = source(
  "../../src/components/annual-wheel/annual-wheel.tsx",
);
const capabilities = source("../../src/lib/meeting-capabilities.ts");

test("workspace has a committee-specific information architecture", () => {
  for (const label of [
    "Aktuelt fokus",
    "Kræver opmærksomhed",
    "Næste møde",
    "Aktive opgaver",
    "Kommende aktiviteter",
    "Seneste dokumenter",
    "Seneste aktivitet",
  ])
    assert.match(page, new RegExp(label));
  assert.doesNotMatch(page, /Seneste ændringer|recent-changes-title/);
  assert.match(page, /data-committee-workspace/);
  assert.doesNotMatch(
    page,
    /metric-strip|CommitteeDashboardPriority|Mine åbne opgaver|Relationsmode/,
  );
});

test("current focus uses explicit activity signals and has no synthetic empty placeholder", () => {
  assert.match(page, /event\.status === "in_progress"/);
  assert.match(page, /event\.priority === "high"/);
  assert.match(page, /data-workspace-focus/);
  assert.match(page, /\{focus \? \(/);
  assert.doesNotMatch(page, /Intet aktuelt fokus|vises her automatisk/);
});

test("attention is summarized before at most two prioritized records", () => {
  assert.match(page, /const overdueTasks = attentionTasks\.filter/);
  assert.match(page, /const dueSoonTasks = attentionTasks\.filter/);
  assert.match(page, /data-attention-summary/);
  assert.match(page, /\{overdueTasks\.length\}/);
  assert.match(page, /\{dueSoonTasks\.length\}/);
  assert.match(page, /forsinket" : "forsinkede"/);
  assert.match(page, /med deadline snart/);
  assert.match(page, /attentionTasks\.slice\(0, 2\)/);
  assert.match(page, /Ingen akutte punkter/);
  assert.doesNotMatch(page, /attentionTasks\.slice\(0, 4\)/);
});

test("activity history uses readable Danish sentences", () => {
  assert.match(page, /Mødet “\$\{item\.title\}” blev opdateret/);
  assert.match(page, /Opgaven “\$\{item\.title\}” blev gennemført/);
  assert.match(
    page,
    /Dokumentet “\$\{item\.title\}” blev uploadet eller opdateret/,
  );
  assert.match(
    page,
    /Beslutningen “\$\{item\.title\}” blev registreret eller opdateret/,
  );
  assert.match(page, /\{activitySentence\(item\)\}/);
});

test("upcoming activities use existing category and status metadata", () => {
  assert.match(page, /activitySecondaryMetadata\(event\)/);
  assert.match(page, /event\.category\?\.trim\(\)/);
  assert.match(page, /activityStatusLabels\[event\.status\]/);
  assert.match(page, /secondaryMetadata/);
  assert.match(page, /break-words/);
});

test("mobile source order keeps primary work before tertiary context", () => {
  const labels = [
    "Aktuelt fokus",
    "Kræver opmærksomhed",
    "Næste møde",
    "Aktive opgaver",
    'title="Kommende aktiviteter"',
    'title="Seneste dokumenter"',
    "Seneste aktivitet",
    "members-title",
  ];
  const positions = labels.map((label) => page.indexOf(label));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(
    positions,
    [...positions].sort((left, right) => left - right),
  );
});

test("viewer, member and manager actions use existing capabilities", () => {
  assert.match(capabilities, /const manager =/);
  assert.match(capabilities, /committeeRole === "member"/);
  assert.match(capabilities, /createMeeting: manager/);
  assert.match(capabilities, /editTasks: editor/);
  assert.match(page, /capabilities\.createMeeting/);
  assert.match(page, /capabilities\.editTasks/);
  assert.match(page, /isOrganizationAdmin/);
});

test("workspace reads are authorized, organization scoped, bounded and parallel", () => {
  const authorization = service.indexOf("requireCommitteeMember");
  const parallel = service.indexOf("Promise.all", authorization);
  assert.ok(authorization >= 0 && parallel > authorization);
  for (const repository of [
    taskRepository,
    meetingRepository,
    documentRepository,
    annualWheelRepository,
  ]) {
    assert.match(repository, /\.eq\("organization_id", organizationId\)/);
    assert.match(
      repository,
      /\.eq\("committee_id"|\.eq\("primary_committee_id"/,
    );
    assert.match(repository, /\.limit\(/);
  }
  assert.match(
    taskRepository,
    /\.not\("status", "in", "\(completed,cancelled\)"\)/,
  );
});

test("canonical modules preserve committee context for filters and creation", () => {
  assert.match(page, /tasks\?scope=all&committee=/);
  assert.match(page, /annual-wheel\?create=1/);
  assert.match(page, /documents\?committee=/);
  assert.match(taskRegister, /requestedCommittee/);
  assert.match(documentRegister, /defaultValue=\{initialCommitteeId\}/);
  assert.match(documentRegister, /openUploadOnLoad/);
  assert.match(annualWheel, /openCreateOnLoad/);
});

test("modules have empty states and mobile-first responsive grids", () => {
  for (const label of [
    "Ingen akutte punkter",
    "Intet kommende møde planlagt",
    "Ingen aktive opgaver",
    "Ingen kommende aktiviteter",
    "Ingen dokumenter i udvalget endnu",
    "Ingen aktivitet registreret endnu",
  ])
    assert.match(page, new RegExp(label));
  assert.match(page, /lg:grid-cols-2/);
  assert.match(page, /sm:grid-cols-/);
  assert.match(page, /flex flex-wrap items-center gap-x-2 gap-y-1/);
  assert.doesNotMatch(page, /overflow-x-auto/);
});

test("activity is derived from visible records and voting is not faked", () => {
  for (const collection of [
    "recentMeetings",
    "recentTasks",
    "recentDecisions",
    "documentItems",
  ])
    assert.match(service, new RegExp(`${collection}\\.map`));
  assert.doesNotMatch(page, /Afstemning|voting|poll/i);
  assert.doesNotMatch(service, /audit_logs|last_visited|workspace_visit/);
});
