import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [navigation, page, errorBoundary, service, migration, trashClient] =
  await Promise.all([
    source("../../src/components/layout/organization-nav.tsx"),
    source("../../src/app/(app)/organizations/[organizationId]/trash/page.tsx"),
    source(
      "../../src/app/(app)/organizations/[organizationId]/trash/error.tsx",
    ),
    source("../../src/services/trash-service.ts"),
    source(
      "../../supabase/migrations/202607240002_issue_1_trash_restore_access.sql",
    ),
    source("../../src/components/trash/organization-trash.tsx"),
  ]);

test("navigation hides trash without the owner/admin capability", () => {
  assert.match(navigation, /canManageTrash = false/);
  assert.match(navigation, /item\.suffix !== "\/trash" \|\| canManageTrash/);
});

test("direct page access returns controlled copy before querying trash", () => {
  const capabilityCheck = page.indexOf("canManageOrganizationTrash");
  const deniedState = page.indexOf("<TrashAccessDenied");
  const trashQuery = page.indexOf("getOrganizationTrash");

  assert.ok(capabilityCheck >= 0);
  assert.ok(deniedState > capabilityCheck);
  assert.ok(trashQuery > deniedState);
  assert.match(page, /requireOrganizationMember/);
});

test("trash errors never render technical error details", () => {
  assert.match(errorBoundary, /Papirkurven kunne ikke indlæses/);
  assert.doesNotMatch(errorBoundary, /error\.message|error\.digest|stack/);
});

test("restore endpoint repeats organization-admin authorization", () => {
  const restoreSource = service.slice(service.indexOf("async restore"));
  const adminCheck = restoreSource.indexOf("requireOrganizationAdmin");
  const organizationRestore = restoreSource.indexOf(
    'parsed.type === "organization"',
  );
  const committeeRestore = restoreSource.indexOf('parsed.type === "committee"');

  assert.ok(adminCheck >= 0);
  assert.ok(organizationRestore > adminCheck);
  assert.ok(committeeRestore > adminCheck);
  assert.match(
    restoreSource,
    /includeDeleted: parsed\.type === "organization"/,
  );
});

test("database rejects direct non-admin restore transitions", () => {
  assert.match(
    migration,
    /old\.deleted_at is not null and new\.deleted_at is null/,
  );
  assert.match(
    migration,
    /public\.is_organization_admin\(target_organization_id\)/,
  );
  for (const table of [
    "organizations",
    "committees",
    "meetings",
    "agenda_items",
    "agenda_occurrences",
  ]) {
    assert.match(migration, new RegExp(`${table}_enforce_admin_trash_restore`));
  }
});

test("existing administrator restore client remains connected", () => {
  assert.match(trashClient, /method: "PATCH"/);
  assert.match(trashClient, /Gendan/);
  assert.match(trashClient, /Papirkurven er tom/);
});
