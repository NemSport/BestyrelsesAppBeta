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

test("task navigation is consolidated while the legacy personal route redirects", async () => {
  const taskItems = organizationNavItems.filter((item) =>
    item.suffix.startsWith("/tasks"),
  );
  assert.deepEqual(taskItems, [
    { label: "Opgaver", match: "exact", suffix: "/tasks" },
  ]);

  const legacyRoute = await source(
    "../../src/app/(app)/organizations/[organizationId]/tasks/my/page.tsx",
  );
  assert.match(legacyRoute, /import \{ redirect \} from "next\/navigation"/);
  assert.match(
    legacyRoute,
    /redirect\(`\/organizations\/\$\{organizationId\}\/tasks\?mine=1`\)/,
  );
  assert.doesNotMatch(
    legacyRoute,
    /components\/tasks\/my-tasks|TaskService|getMyTasks|<MyTasks/,
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
  const [navigation, dialogFocus, styles] = await Promise.all([
    source("../../src/components/layout/organization-nav.tsx"),
    source("../../src/hooks/use-dialog-focus.ts"),
    source("../../src/app/globals.css"),
  ]);

  assert.match(navigation, /aria-expanded=\{mobileOpen\}/);
  assert.match(navigation, /aria-haspopup="dialog"/);
  assert.match(navigation, /aria-modal="true"/);
  assert.match(navigation, /role="dialog"/);
  assert.match(navigation, /useDialogFocus/);
  assert.match(dialogFocus, /event\.key === "Escape"/);
  assert.match(dialogFocus, /event\.key !== "Tab"/);
  assert.match(dialogFocus, /document\.body\.style\.overflow = "hidden"/);
  assert.match(dialogFocus, /returnTarget\?\.isConnected/);
  assert.match(navigation, /window\.matchMedia\("\(min-width: 1024px\)"\)/);
  assert.match(navigation, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(navigation, /organizationNavIconNames\[item\.suffix\]/);
  assert.match(navigation, /<AppIcon name="menu"/);
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
  assert.match(styles, /\.org-nav-link-active[\s\S]*inset 3px 0 0/);
  assert.match(
    styles,
    /@media \(max-width: 1023px\)[\s\S]*\.org-desktop-navigation[\s\S]*display: none/,
  );
});

test("every existing organization destination has one decorative Lucide icon", async () => {
  const [navigation, iconSystem] = await Promise.all([
    source("../../src/components/layout/organization-nav.tsx"),
    source("../../src/components/icons/app-icon.tsx"),
  ]);

  for (const item of organizationNavItems) {
    const escapedSuffix = item.suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(iconSystem, new RegExp(`"${escapedSuffix}":?\\s*"`));
  }

  assert.match(iconSystem, /from "lucide-react"/);
  assert.match(iconSystem, /aria-hidden="true"/);
  assert.match(navigation, /<span>\{item\.label\}<\/span>/);
});

test("global topbar reuses memberships, capabilities, and existing create flows", async () => {
  const [
    shell,
    protectedLayout,
    switcher,
    quickActions,
    tasksPage,
    taskRegister,
    dropdown,
    styles,
  ] = await Promise.all([
    source("../../src/components/layout/app-shell.tsx"),
    source("../../src/app/(app)/layout.tsx"),
    source("../../src/components/layout/organization-switcher.tsx"),
    source("../../src/components/layout/quick-action-menu.tsx"),
    source("../../src/app/(app)/organizations/[organizationId]/tasks/page.tsx"),
    source("../../src/components/tasks/task-register.tsx"),
    source("../../src/components/ui/dropdown.tsx"),
    source("../../src/app/globals.css"),
  ]);

  assert.match(shell, /BestyrelsesApp/);
  assert.match(shell, /Hold overblik over bestyrelsesarbejdet/);
  assert.match(shell, /app-header-search-reserve/);
  assert.match(
    protectedLayout,
    /OrganizationService\(db\)\.listForCurrentUser/,
  );
  assert.match(switcher, /organizations\.map/);
  assert.match(switcher, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(switcher, /href=\{`\/organizations\/\$\{organization\.id\}`\}/);
  assert.match(quickActions, /capabilities\.createMeeting/);
  assert.match(quickActions, /capabilities\.editTasks/);
  assert.match(quickActions, /aria-label="Nyt møde"/);
  assert.match(quickActions, /tasks\?create=1/);
  assert.match(tasksPage, /openCreateOnLoad=\{create === "1"\}/);
  assert.match(taskRegister, /!openCreateOnLoad \|\| !canCreate/);
  assert.match(dropdown, /aria-expanded=\{open\}/);
  assert.doesNotMatch(
    styles,
    /\.app-header-inner \{\s*flex-wrap: wrap/,
  );
  assert.match(
    styles,
    /@media \(max-width: 1023px\)[\s\S]*\.app-header-action[\s\S]*min-height: 2\.75rem/,
  );
});

test("Version 3.1.4b shares the organization theme and dropdown pattern", async () => {
  const [shell, switcher, headerSlot, quickActions, dropdown, styles] =
    await Promise.all([
      source("../../src/components/layout/app-shell.tsx"),
      source("../../src/components/layout/organization-switcher.tsx"),
      source("../../src/components/layout/quick-action-header-slot.tsx"),
      source("../../src/components/layout/quick-action-menu.tsx"),
      source("../../src/components/ui/dropdown.tsx"),
      source("../../src/app/globals.css"),
    ]);

  assert.match(shell, /id="app-header"/);
  assert.doesNotMatch(switcher, /max-w-40/);
  assert.match(switcher, /app-header-organization-name min-w-0 truncate/);
  assert.match(
    styles,
    /app-header-organization-switcher[\s\S]*max-width: min\(30rem, 38vw\)/,
  );
  assert.match(
    styles,
    /app-header-organization-name[\s\S]*max-width: min\(26rem, 32vw\)/,
  );
  assert.match(headerSlot, /querySelector<HTMLElement>\("\.app-frame"\)/);
  assert.match(headerSlot, /themeRoot\.style\.setProperty/);
  assert.match(headerSlot, /themeRoot\.style\.removeProperty/);
  assert.match(
    styles,
    /\.app-header \{[\s\S]*background: rgb\(var\(--brand-primary\)\)/,
  );
  assert.match(
    styles,
    /\.org-sidebar \{[\s\S]*background: rgb\(var\(--brand-primary\)\)/,
  );
  assert.match(switcher, /active \? "bg-brand-soft text-brand" : "text-ink"/);
  assert.match(dropdown, /dropdown-panel[\s\S]*bg-surface[\s\S]*text-ink/);
  assert.match(quickActions, /<Dropdown/);
  assert.match(quickActions, /app-header-overflow-dropdown/);
  assert.match(quickActions, /panelId="quick-action-options"/);
  assert.doesNotMatch(quickActions, /createPortal|getBoundingClientRect/);
});
