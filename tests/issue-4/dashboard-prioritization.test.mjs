import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  committeePriorityCopy,
  organizationPriorityCopy,
  resolveCommitteeDashboardAudience,
  resolveOrganizationDashboardAudience,
} from "../../src/lib/dashboard-prioritization.ts";
import { getMeetingCapabilities } from "../../src/lib/meeting-capabilities.ts";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const organizationPage = source(
  "../../src/app/(app)/organizations/[organizationId]/page.tsx",
);
const committeePage = source(
  "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/page.tsx",
);
const organizationPriority = source(
  "../../src/components/dashboard/organization-dashboard-priority.tsx",
);
const committeePriority = source(
  "../../src/components/dashboard/committee-dashboard-priority.tsx",
);
const committeeService = source("../../src/services/committee-service.ts");
const decisionRepository = source(
  "../../src/repositories/decision-repository.ts",
);
const loadingState = source(
  "../../src/app/(app)/organizations/[organizationId]/loading.tsx",
);
const errorState = source(
  "../../src/app/(app)/organizations/[organizationId]/error.tsx",
);
const quickActionMenu = source(
  "../../src/components/layout/quick-action-menu.tsx",
);

test("organization dashboard resolves viewer, member, chair, and admin priorities", () => {
  const viewer = getMeetingCapabilities("viewer", "viewer");
  const member = getMeetingCapabilities("member", "member");
  const chair = getMeetingCapabilities("member", "chair");
  const admin = getMeetingCapabilities("admin", null);

  assert.equal(
    resolveOrganizationDashboardAudience("viewer", [viewer]),
    "viewer",
  );
  assert.equal(
    resolveOrganizationDashboardAudience("member", [member]),
    "member",
  );
  assert.equal(
    resolveOrganizationDashboardAudience("member", [chair]),
    "chair",
  );
  assert.equal(resolveOrganizationDashboardAudience("admin", [admin]), "admin");
  assert.equal(resolveOrganizationDashboardAudience("owner", []), "admin");
  assert.match(organizationPriorityCopy.viewer.title, /møde/i);
  assert.match(organizationPriorityCopy.member.title, /opgaver/i);
  assert.match(organizationPriorityCopy.chair.description, /deltagere/i);
  assert.match(organizationPriorityCopy.admin.title, /organisation/i);
});

test("committee dashboard uses the same capabilities for presentation", () => {
  const viewer = getMeetingCapabilities("viewer", "viewer");
  const member = getMeetingCapabilities("member", "member");
  const chair = getMeetingCapabilities("member", "chair");
  const admin = getMeetingCapabilities("admin", null);

  assert.equal(
    resolveCommitteeDashboardAudience("viewer", "viewer", viewer),
    "viewer",
  );
  assert.equal(
    resolveCommitteeDashboardAudience("member", "member", member),
    "member",
  );
  assert.equal(
    resolveCommitteeDashboardAudience("member", "chair", chair),
    "chair",
  );
  assert.equal(
    resolveCommitteeDashboardAudience("admin", null, admin),
    "admin",
  );
  assert.match(committeePriorityCopy.viewer.description, /læseadgang/i);
  assert.match(committeePriorityCopy.member.description, /egne åbne opgaver/i);
  assert.match(committeePriorityCopy.chair.title, /møde/i);
});

test("viewer presentation contains read destinations and no write CTA", () => {
  assert.match(organizationPriority, /audience === "viewer"/);
  assert.match(organizationPriority, /Seneste godkendte referat/);
  assert.match(organizationPriority, /Læs referat/);
  assert.match(committeePriority, /data-dashboard-audience/);
  assert.match(committeePage, /Ingen skrivehandlinger|læseadgang/i);
  assert.match(committeePage, /dashboardAudience !== "viewer"/);
  assert.match(
    quickActionMenu,
    /!canCreateMeeting[\s\S]*!canCreateQuickMeeting[\s\S]*!canScheduleAgendaItem[\s\S]*return null/,
  );
  assert.doesNotMatch(
    organizationPage,
    /overview\.myOpenTasks\.length\s*\?\s*overview\.myOpenTasks\s*:\s*overview\.openTasks/,
  );
});

test("member, chair, and admin CTAs are capability-aware and navigable", () => {
  assert.match(organizationPriority, /tasks\/my/);
  assert.match(organizationPriority, /managedCommitteeIds/);
  assert.match(organizationPriority, /manageMinutesApproval/);
  assert.match(
    organizationPriority,
    /minutes\.status === "ready_for_approval"/,
  );
  assert.match(organizationPriority, /managedMeeting \|\| managedMinutes/);
  assert.match(organizationPriority, /meeting-participants-heading/);
  assert.match(organizationPriority, /minutes-approval/);
  assert.match(organizationPriority, /audience === "admin"/);
  assert.match(committeePage, /capabilities\.createAgendaItem/);
  assert.match(committeePriority, /capabilities\.createMeeting/);
  assert.match(committeePriority, /capabilities\.manageParticipants/);
  assert.match(committeePriority, /nextMeeting \|\| approvalMinutes/);
});

test("committee dashboard additions remain RLS-scoped and read-only", () => {
  const membershipCheck = committeeService.indexOf("requireCommitteeMember");
  const parallelReads = committeeService.indexOf("Promise.all");
  assert.ok(membershipCheck >= 0 && membershipCheck < parallelReads);
  assert.match(
    committeeService,
    /listByResponsible\(organizationId, user\.id\)/,
  );
  assert.match(
    committeeService,
    /listByCommittee\(organizationId, committeeId\)/,
  );
  assert.match(decisionRepository, /\.eq\("organization_id", organizationId\)/);
  assert.match(decisionRepository, /\.eq\("committee_id", committeeId\)/);
  assert.doesNotMatch(organizationPriority, /fetch\(|POST|PATCH|DELETE/);
  assert.doesNotMatch(committeePriority, /fetch\(|POST|PATCH|DELETE/);
});

test("priority, empty, loading, and error states remain responsive and actionable", () => {
  const sharedPanel = source(
    "../../src/components/dashboard/dashboard-priority-panel.tsx",
  );
  assert.match(sharedPanel, /flex-col/);
  assert.match(sharedPanel, /lg:flex-row/);
  assert.match(organizationPriority, /md:grid-cols-2/);
  assert.match(committeePriority, /lg:grid-cols-2/);
  assert.match(committeePriority, /Der er intet kommende møde/);
  assert.match(loadingState, /aria-busy="true"/);
  assert.match(loadingState, /animate-pulse/);
  assert.match(errorState, /role="alert"/);
  assert.match(errorState, /reset/);
  assert.match(errorState, /Prøv igen/);
});
