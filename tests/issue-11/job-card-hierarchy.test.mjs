import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [register, pdf, service, repository, policies, page] =
  await Promise.all([
    source("../../src/components/job-cards/job-card-register.tsx"),
    source("../../src/lib/job-card-pdf.ts"),
    source("../../src/services/job-card-service.ts"),
    source("../../src/repositories/job-card-repository.ts"),
    source(
      "../../supabase/migrations/202606150004_job_cards_onboarding.sql",
    ),
    source(
      "../../src/app/(app)/organizations/[organizationId]/job-cards/page.tsx",
    ),
  ]);

test("job cards expose the stable scan order before secondary detail", () => {
  const purpose = register.indexOf('title="Formål"');
  const responsibility = register.indexOf('title="Ansvar"');
  const expectations = register.indexOf('title="Forventninger"');
  const nextSteps = register.indexOf('title="Næste skridt"');

  assert.ok(purpose > 0);
  assert.ok(purpose < responsibility);
  assert.ok(responsibility < expectations);
  assert.ok(expectations < nextSteps);
  assert.match(register, /Se hele jobkortet og onboarding/);
  assert.match(register, /JobCardScanBlock/);
});

test("mobile layout wraps prose and links without fixed filter widths", () => {
  assert.match(register, /grid grid-cols-2 gap-3/);
  assert.match(register, /className="field w-full min-w-0"/);
  assert.match(register, /break-words text-sm/);
  assert.match(register, /break-all text-xs text-muted/);
  assert.doesNotMatch(register, /className="field min-w-\[/);
  assert.doesNotMatch(register, /block truncate text-sm/);
});

test("read-only users receive explicit capability copy without edit actions", () => {
  assert.match(register, /Oprettelse og\s*redigering håndteres af/);
  assert.match(register, /\{data\.canManage \? \(/);
  assert.match(register, /Rediger jobkort/);
  assert.match(register, /Opret jobkort/);
  assert.match(register, /onArchive=\{archive\}/);
  assert.match(register, /Download PDF/);
  assert.match(
    register,
    /\(data\.editableCommitteeIds \?\? \[\]\)\.includes/,
  );
  assert.match(service, /getMeetingCapabilities/);
  assert.match(service, /\.editTasks/);
  assert.match(service, /editableCommitteeIds/);
});

test("empty states give different next steps to administrators and readers", () => {
  assert.match(register, /Opret det første jobkort/);
  assert.match(register, /data\.canManage \?/);
  assert.match(register, /En ejer eller administrator kan oprette/);
  assert.match(register, /Start med den rolle/);
  assert.match(register, /Ingen jobkort matcher din søgning/);
  assert.match(register, /Ryd filtre/);
});

test("job card PDF leads with purpose, responsibility, expectations and next steps", () => {
  const overview = pdf.indexOf('report.addSection("Rollen kort fortalt")');
  const purpose = pdf.indexOf('addRichKeyValue("Formål"');
  const responsibility = pdf.indexOf('addRichKeyValue("Ansvar"');
  const expectations = pdf.indexOf('addRichKeyValue("Forventninger"');
  const nextSteps = pdf.indexOf(
    'addRichKeyValue(\n    "Næste skridt - de første 30 dage"',
  );

  assert.ok(overview > 0);
  assert.ok(overview < purpose);
  assert.ok(purpose < responsibility);
  assert.ok(responsibility < expectations);
  assert.ok(expectations < nextSteps);
  assert.match(pdf, /report\.addSection\("Rammer og samarbejde"\)/);
  assert.match(pdf, /report\.addSection\("Onboarding"\)/);
  assert.match(pdf, /report\.addSection\("Opgaveskabeloner"\)/);
  assert.match(pdf, /Relaterede årshjulspunkter/);
  assert.match(pdf, /Relaterede beslutninger/);
  assert.match(pdf, /Dokumentlinks/);
});

test("organization members read while service and RLS keep writes admin-only", () => {
  assert.match(service, /requireOrganizationMember/);
  assert.match(service, /requireOrganizationAdmin/);
  assert.match(service, /created_by: user\.id/);
  assert.match(service, /updated_by: user\.id/);
  assert.match(repository, /\.eq\("organization_id", organizationId\)/);
  assert.match(
    policies,
    /role_profiles_read[\s\S]*is_organization_member\(organization_id\)/,
  );
  assert.match(
    policies,
    /role_profiles_admin[\s\S]*is_organization_admin\(organization_id\)/,
  );
  assert.match(
    policies,
    /onboarding_guides_admin[\s\S]*is_organization_admin\(organization_id\)/,
  );
});

test("the route keeps the existing organization-scoped read model", () => {
  assert.match(page, /JobCardService/);
  assert.match(page, /\.getOverview\(\s*organizationId/);
  assert.match(
    page,
    /<JobCardRegister data=\{data\} organizationId=\{organizationId\}/,
  );
});
