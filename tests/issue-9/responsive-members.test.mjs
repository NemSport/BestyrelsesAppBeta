import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [members, actionMenu, table, capabilities, feedback] = await Promise.all([
  source("../../src/components/members/member-administration.tsx"),
  source("../../src/components/ui/action-menu.tsx"),
  source("../../src/components/ui/table.tsx"),
  source("../../src/lib/member-access-capabilities.ts"),
  source("../../src/components/members/member-access-editor.tsx"),
]);

test("member and invitation tables become labelled card rows only below desktop", () => {
  assert.equal(
    (members.match(/className="block min-w-0 md:table md:min-w-full"/g) ?? [])
      .length,
    2,
  );
  assert.equal(
    (members.match(/className="hidden md:table-header-group"/g) ?? []).length,
    2,
  );
  assert.equal(
    (members.match(/className="grid gap-3 md:table-row-group"/g) ?? []).length,
    2,
  );
  assert.match(members, /md:table-row md:rounded-none/);
  assert.match(members, />\s*Organisationsrolle\s*</);
  assert.match(members, />\s*Invitationsstatus\s*</);
});

test("mobile member content wraps without a horizontal-scroll dependency", () => {
  assert.match(
    members,
    /className="overflow-visible border-0 bg-transparent md:overflow-x-auto/,
  );
  assert.match(members, /break-all text-sm text-muted/);
  assert.match(members, /max-w-full whitespace-normal break-words leading-4/);
  assert.doesNotMatch(members, /className="min-w-(44|56|64)"/);
  assert.match(members, /md:min-w-56/);
  assert.match(members, /md:min-w-64/);
  assert.match(members, /md:min-w-44/);
});

test("member actions remain capability-filtered and destructive actions stay separate", () => {
  assert.match(members, /getMemberAccessCapabilities/);
  assert.match(
    members,
    /capabilities\.canEditAccess \|\|\s*capabilities\.canRemove/,
  );
  assert.match(members, /\{capabilities\.canEditAccess \? \(/);
  assert.match(members, /\{capabilities\.canRemove \? \(/);
  assert.match(members, /<ActionMenu[\s\S]*Fjern medlem[\s\S]*<\/ActionMenu>/);
  assert.match(members, /ariaLabel=\{`Flere handlinger for/);
  assert.match(actionMenu, /aria-label=\{ariaLabel\}/);
  assert.match(capabilities, /const canManageMembers = actorIsOwner \|\| actorIsAdmin/);
});

test("responsive rows keep native table semantics and accessible feedback", () => {
  assert.match(table, /<table/);
  assert.match(table, /<thead/);
  assert.match(table, /<tbody/);
  assert.match(table, /<tr/);
  assert.match(table, /<td/);
  assert.match(table, /scope=\{scope\}/);
  assert.match(members, /role="status"/);
  assert.match(members, /role="alert"/);
  assert.match(feedback, /MutationFeedback/);
});

test("empty states and pending invitation state remain explicit", () => {
  assert.match(members, /Organisationen har endnu ingen medlemmer/);
  assert.match(members, /Der er ingen afventende invitationer/);
  assert.match(members, /invitationStatusLabels\[invitation\.status\]/);
  assert.match(members, /tone="warning"/);
});
