import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const page = source("../../src/app/(app)/organizations/page.tsx");
const selector = source(
  "../../src/components/organizations/organization-selector.tsx",
);
const switcher = source(
  "../../src/components/layout/organization-switcher.tsx",
);
const appLayout = source("../../src/app/(app)/layout.tsx");
const modal = source("../../src/components/ui/modal.tsx");
const resourceForm = source("../../src/components/forms/resource-form.tsx");
const organizationService = source(
  "../../src/services/organization-service.ts",
);
const organizationRepository = source(
  "../../src/repositories/organization-repository.ts",
);
const committeeRepository = source(
  "../../src/repositories/committee-repository.ts",
);
const brandingRepository = source(
  "../../src/repositories/organization-branding-repository.ts",
);
const nextConfig = source("../../next.config.ts");

test("organization entry is a workspace selector instead of a permanent form", () => {
  assert.match(page, /listWorkspaceEntries\(\)/);
  assert.match(page, /<OrganizationSelector organizations=\{organizations\}/);
  assert.doesNotMatch(page, /<ResourceForm|new-organization|lg:grid-cols-\[1fr_360px\]/);
  assert.match(selector, /eyebrow="Organisationer"/);
  assert.match(selector, /title="Vælg organisation"/);
  assert.match(
    selector,
    /description="Fortsæt til det arbejdsrum, du vil arbejde i\."/,
  );
});

test("organization cards are semantic full-card links in a responsive two-column grid", () => {
  assert.match(selector, /grid grid-cols-1 gap-3 md:grid-cols-2/);
  assert.match(selector, /interactiveSurfaceClassName/);
  assert.match(
    selector,
    /aria-label=\{`Åbn arbejdsrummet \$\{organization\.name\}`\}/,
  );
  assert.match(
    selector,
    /href=\{`\/organizations\/\$\{organization\.id\}`\}/,
  );
  assert.match(selector, /min-h-32 min-w-0/);
  assert.match(selector, /break-words/);

  const cardLinks = selector.match(/<Link[\s\S]*?<\/Link>/g) ?? [];
  assert.ok(cardLinks.length > 0);
  assert.ok(cardLinks.every((link) => !/<button|<Button/.test(link)));
});

test("cards present role, visible committee count, logo, initials, and navigation cue", () => {
  assert.match(selector, /organizationRoleLabels\[organization\.role\]/);
  assert.match(selector, /committeeLabel\(organization\.committeeCount\)/);
  assert.match(selector, /count === 1 \? "1 udvalg" : `\$\{count\} udvalg`/);
  assert.match(selector, /organization\.logoUrl \? \(/);
  assert.match(selector, /organizationInitials\(organization\.name\)/);
  assert.match(selector, /name="arrowRight"/);
});

test("creation reuses the existing API flow inside the shared accessible modal", () => {
  assert.match(selector, /<Modal[\s\S]*open=\{createOpen\}/);
  assert.match(selector, /initialFocusRef=\{nameInputRef\}/);
  assert.match(selector, /endpoint="\/api\/organizations"/);
  assert.match(selector, /successPath="\/organizations\/:id"/);
  assert.match(selector, /label: "Annuller"/);
  assert.match(resourceForm, /ref=\{field === fields\[0\] \? initialFocusRef/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /useDialogFocus/);
  assert.match(modal, /createPortal/);
});

test("existing authenticated owner creation contract remains authoritative", () => {
  assert.match(organizationService, /async create\(input: unknown\)/);
  assert.match(
    organizationService,
    /await this\.auth\.requireUser\(\)[\s\S]*organizationInputSchema\.parse/,
  );
  assert.match(organizationService, /return this\.organizations\.create\(name, slug\)/);
  assert.match(organizationRepository, /create_organization_with_owner/);
});

test("workspace metadata is loaded in bounded RLS-protected batches", () => {
  assert.match(
    organizationService,
    /async listWorkspaceEntries\(\): Promise<OrganizationWorkspaceEntry\[]>/,
  );
  assert.match(organizationService, /const user = await this\.auth\.requireUser\(\)/);
  assert.match(organizationService, /countActiveByOrganizations\(organizationIds\)/);
  assert.match(organizationService, /listByOrganizations\(organizationIds\)/);
  assert.match(committeeRepository, /\.in\("organization_id", organizationIds\)/);
  assert.match(committeeRepository, /\.is\("archived_at", null\)/);
  assert.match(committeeRepository, /\.is\("deleted_at", null\)/);
  assert.match(brandingRepository, /\.in\("organization_id", organizationIds\)/);
});

test("empty state opens the same compact creation modal", () => {
  assert.match(selector, /organizations\.length > 0 \? \(/);
  assert.match(selector, /Du har endnu ingen organisationer/);
  const openActions = selector.match(/onClick=\{\(\) => setCreateOpen\(true\)\}/g);
  assert.equal(openActions?.length, 2);
});

test("topbar switcher uses the same organization names and role metadata", () => {
  assert.match(appLayout, /role: membership\.role/);
  assert.match(switcher, /activeOrganization\?\.name \?\? "Vælg organisation"/);
  assert.match(switcher, /organizationRoleLabels\[organization\.role\]/);
  assert.match(switcher, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(switcher, /href="\/organizations"/);
  assert.match(switcher, /Alle organisationer/);
  assert.match(switcher, /truncate/);
  assert.match(switcher, /calc\(100vw-2rem\)/);
});

test("development chunks are isolated from production builds", () => {
  assert.match(nextConfig, /process\.env\.NODE_ENV === "development"/);
  assert.match(nextConfig, /\? "\.next-dev"/);
  assert.match(nextConfig, /: "\.next"/);
});
