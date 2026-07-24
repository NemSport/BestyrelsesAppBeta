import assert from "node:assert/strict";
import test from "node:test";

const {
  getMemberAccessCapabilities,
  isCommitteeRoleReduction,
  isOrganizationRoleReduction,
} = await import("../../src/lib/member-access-capabilities.ts");

const base = {
  actorUserId: "actor",
  targetRole: "member",
  targetUserId: "target",
};

test("viewer and member cannot administer member access", () => {
  for (const actorRole of ["viewer", "member"]) {
    const capabilities = getMemberAccessCapabilities({ ...base, actorRole });
    assert.equal(capabilities.canManageMembers, false);
    assert.equal(capabilities.canEditAccess, false);
    assert.equal(capabilities.canRemove, false);
  }
});

test("a committee chair with organization member role gets no organization admin rights", () => {
  const capabilities = getMemberAccessCapabilities({
    ...base,
    actorRole: "member",
  });
  assert.equal(capabilities.canEditAccess, false);
  assert.equal(capabilities.canRemove, false);
});

test("administrator can edit another non-owner without assigning owner", () => {
  const capabilities = getMemberAccessCapabilities({
    ...base,
    actorRole: "admin",
  });
  assert.equal(capabilities.canEditAccess, true);
  assert.equal(capabilities.canRemove, true);
  assert.deepEqual(capabilities.assignableOrganizationRoles, [
    "admin",
    "member",
    "viewer",
  ]);
});

test("administrator cannot edit self or an owner", () => {
  const self = getMemberAccessCapabilities({
    ...base,
    actorRole: "admin",
    targetUserId: "actor",
  });
  const owner = getMemberAccessCapabilities({
    ...base,
    actorRole: "admin",
    targetRole: "owner",
  });
  assert.equal(self.canEditAccess, false);
  assert.equal(self.selfProtectedFromAdmin, true);
  assert.equal(owner.canEditAccess, false);
  assert.equal(owner.canRemove, false);
  assert.equal(owner.ownerProtectedFromAdmin, true);
});

test("owner can edit protected access and assign owner", () => {
  const capabilities = getMemberAccessCapabilities({
    ...base,
    actorRole: "owner",
    targetRole: "owner",
  });
  assert.equal(capabilities.canEditAccess, true);
  assert.equal(capabilities.canRemove, true);
  assert.ok(capabilities.assignableOrganizationRoles.includes("owner"));
});

test("last owner can edit committee access but cannot be demoted or removed in UI", () => {
  const capabilities = getMemberAccessCapabilities({
    ...base,
    actorRole: "owner",
    targetRole: "owner",
    activeOwnerCount: 1,
  });
  assert.equal(capabilities.canEditAccess, true);
  assert.equal(capabilities.canRemove, false);
  assert.equal(capabilities.lastOwnerProtected, true);
  assert.deepEqual(capabilities.assignableOrganizationRoles, ["owner"]);
});

test("access-reduction helpers detect role demotions", () => {
  assert.equal(isOrganizationRoleReduction("admin", "member"), true);
  assert.equal(isOrganizationRoleReduction("member", "admin"), false);
  assert.equal(isCommitteeRoleReduction("chair", "viewer"), true);
  assert.equal(isCommitteeRoleReduction("member", "chair"), false);
});
