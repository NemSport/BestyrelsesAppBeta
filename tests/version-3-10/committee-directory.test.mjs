import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = source(
  "../../src/app/(app)/organizations/[organizationId]/committees/page.tsx",
);
const service = source("../../src/services/committee-service.ts");
const annualWheelRepository = source(
  "../../src/repositories/annual-wheel-repository.ts",
);

test("committee directory presents semantic workspace cards", () => {
  assert.match(page, /data-committee-directory/);
  assert.match(page, /md:grid-cols-2/);
  assert.match(page, /interactiveSurfaceClassName/);
  assert.match(page, /aria-label=\{`Åbn arbejdsrummet/);
  assert.doesNotMatch(page, />\s*Åbn udvalg\s*</);
  assert.match(page, /line-clamp-3.*md:line-clamp-2/);
  assert.doesNotMatch(page, /overflow-x-auto|h-\[|max-h-/);
});

test("cards show members, operational signals and a robust status", () => {
  assert.match(page, /previewMembers = item\.members\.slice\(0, 4\)/);
  assert.match(page, /\+\{remainingMembers\}/);
  assert.match(page, /aktive opgaver/);
  assert.match(page, /kommende møder/);
  assert.match(page, /item\.overdueTaskCount > 0/);
  assert.match(page, /Kræver handling/);
  assert.match(page, /Roligt/);
  assert.doesNotMatch(page, /health|score|sundhed/i);
});

test("next meeting is preferred with annual-wheel fallback", () => {
  const meeting = page.indexOf("item.nextMeeting");
  const activity = page.indexOf("item.nextActivity", meeting);
  assert.ok(meeting >= 0 && activity > meeting);
  assert.match(page, /Næste møde/);
  assert.match(page, /Næste aktivitet/);
});

test("directory reads are authorized, parallel and organization scoped", () => {
  const authorization = service.indexOf(
    "requireOrganizationMember(organizationId, user.id)",
    service.indexOf("async listDirectory"),
  );
  const parallel = service.indexOf("Promise.all", authorization);
  assert.ok(authorization >= 0 && parallel > authorization);
  for (const call of [
    "committees.listByOrganization(organizationId)",
    "meetings.listByOrganization(organizationId)",
    "tasks.listByOrganization(organizationId)",
    "annualWheel.listCommitteeDirectoryUpcoming(organizationId, today)",
    "organizationMembers.listMembers(organizationId)",
  ]) {
    assert.ok(service.includes(call));
  }
  assert.match(
    annualWheelRepository,
    /\.eq\("organization_id", organizationId\)/,
  );
  const directoryEnd = service.indexOf("async create", parallel);
  assert.doesNotMatch(
    service.slice(parallel, directoryEnd),
    /requireCommitteeMember/,
  );
});

test("creation remains capability protected and routes are unchanged", () => {
  assert.match(page, /isOrganizationAdmin\(context\.membership\.role\)/);
  assert.match(page, /canCreate \? createAction : undefined/);
  assert.match(page, /href=\{`\$\{root\}\/new`\}/);
  assert.match(page, /href=\{`\$\{root\}\/\$\{item\.committee\.id\}`\}/);
});
