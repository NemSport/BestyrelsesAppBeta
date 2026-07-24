import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getActiveCommitteeId,
  getVisibleOrganizationNavItems,
  isOrganizationNavItemActive,
  organizationNavItems,
} from "../../src/lib/organization-navigation.ts";
import { getMeetingCapabilities } from "../../src/lib/meeting-capabilities.ts";
import { canManageOrganizationTrash } from "../../src/lib/trash-capabilities.ts";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("active routes preserve organization and committee context", () => {
  const root = "/organizations/org-1";
  const meetings = organizationNavItems.find((item) => item.label === "Møder");
  assert.ok(meetings);
  assert.equal(
    isOrganizationNavItemActive(
      `${root}/committees/committee-1/meetings/meeting-1`,
      root,
      meetings,
    ),
    true,
  );
  assert.equal(
    getActiveCommitteeId(
      `${root}/committees/committee-1/agenda-items/item-1`,
      root,
    ),
    "committee-1",
  );
  assert.equal(getActiveCommitteeId(`${root}/committees/new`, root), null);
});

test("role-filtered destinations do not expose trash to ordinary roles", () => {
  const ordinaryItems = getVisibleOrganizationNavItems(false);
  const adminItems = getVisibleOrganizationNavItems(true);
  assert.equal(
    ordinaryItems.some((item) => item.suffix === "/trash"),
    false,
  );
  assert.equal(
    adminItems.some((item) => item.suffix === "/trash"),
    true,
  );
});

test("viewer, member, chair, and admin retain existing action visibility", () => {
  const viewer = getMeetingCapabilities("viewer", "viewer");
  const member = getMeetingCapabilities("member", "member");
  const chair = getMeetingCapabilities("member", "chair");
  const admin = getMeetingCapabilities("admin", null);

  assert.equal(viewer.createMeeting, false);
  assert.equal(viewer.editTasks, false);
  assert.equal(member.createMeeting, false);
  assert.equal(member.editTasks, true);
  assert.equal(chair.createMeeting, true);
  assert.equal(chair.scheduleAgendaItem, true);
  assert.equal(admin.createMeeting, true);
  assert.equal(admin.restoreMeeting, true);

  assert.equal(canManageOrganizationTrash("viewer"), false);
  assert.equal(canManageOrganizationTrash("member"), false);
  assert.equal(canManageOrganizationTrash("admin"), true);
});

test("mobile drawer implements dialog semantics and interaction lifecycle", async () => {
  const [navigation, styles] = await Promise.all([
    source("../../src/components/layout/organization-nav.tsx"),
    source("../../src/app/globals.css"),
  ]);

  assert.match(navigation, /aria-expanded=\{mobileOpen\}/);
  assert.match(navigation, /aria-haspopup="dialog"/);
  assert.match(navigation, /aria-modal="true"/);
  assert.match(navigation, /role="dialog"/);
  assert.match(navigation, /event\.key === "Escape"/);
  assert.match(navigation, /event\.key !== "Tab"/);
  assert.match(navigation, /document\.body\.style\.overflow = "hidden"/);
  assert.match(navigation, /trigger\?\.focus\(\)/);
  assert.match(navigation, /window\.matchMedia\("\(min-width: 1024px\)"\)/);
  assert.match(navigation, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(styles, /\.org-mobile-drawer[\s\S]*overflow-y: auto/);
  assert.match(styles, /min-height: 2\.75rem/);
});

test("desktop navigation remains present outside the mobile breakpoint", async () => {
  const [navigation, styles] = await Promise.all([
    source("../../src/components/layout/organization-nav.tsx"),
    source("../../src/app/globals.css"),
  ]);
  assert.match(navigation, /className="org-desktop-navigation"/);
  assert.match(styles, /@media \(min-width: 1024px\)/);
  assert.match(styles, /\.org-sidebar[\s\S]*position: sticky/);
  assert.match(
    styles,
    /@media \(max-width: 1023px\)[\s\S]*\.org-desktop-navigation[\s\S]*display: none/,
  );
});
