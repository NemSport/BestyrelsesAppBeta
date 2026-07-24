import assert from "node:assert/strict";
import test from "node:test";

const { canManageOrganizationTrash } =
  await import("../../src/lib/trash-capabilities.ts");

test("viewer and member cannot manage organization trash", () => {
  assert.equal(canManageOrganizationTrash("viewer"), false);
  assert.equal(canManageOrganizationTrash("member"), false);
});

test("committee chair receives no trash access from an organization member role", () => {
  assert.equal(canManageOrganizationTrash("member"), false);
});

test("administrator and owner can manage organization trash", () => {
  assert.equal(canManageOrganizationTrash("admin"), true);
  assert.equal(canManageOrganizationTrash("owner"), true);
});
