import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("shared breadcrumbs expose semantic desktop context and a canonical mobile parent", async () => {
  const breadcrumbs = await source(
    "../../src/components/ui/breadcrumbs.tsx",
  );

  assert.match(breadcrumbs, /aria-label="Brødkrummer"/);
  assert.match(breadcrumbs, /aria-current=\{current \? "page" : undefined\}/);
  assert.match(breadcrumbs, /sm:hidden/);
  assert.match(breadcrumbs, /hidden[\s\S]*sm:flex/);
  assert.match(breadcrumbs, /min-h-11/);
  assert.doesNotMatch(breadcrumbs, /history\.back|router\.back/);
});

test("core detail pages use canonical parent routes instead of browser history", async () => {
  const [agenda, agendaEdit, document, stakeholder] = await Promise.all([
    source(
      "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/agenda-items/[agendaItemId]/page.tsx",
    ),
    source(
      "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/agenda-items/[agendaItemId]/edit/page.tsx",
    ),
    source("../../src/components/documents/document-detail.tsx"),
    source("../../src/components/stakeholders/stakeholder-profile.tsx"),
  ]);

  for (const detail of [agenda, agendaEdit, document, stakeholder]) {
    assert.match(detail, /<Breadcrumbs/);
    assert.doesNotMatch(detail, /history\.back|router\.back/);
  }
  assert.match(agenda, /href: `\$\{root\}\/meetings\/\$\{meeting\.id\}`/);
  assert.match(document, /\/documents`/);
  assert.match(stakeholder, /\/stakeholders`/);
});

test("mobile task board shows one status at a time without horizontal board scrolling", async () => {
  const register = await source("../../src/components/tasks/task-register.tsx");

  assert.match(register, /aria-label="Vælg statuskolonne"/);
  assert.match(register, /aria-pressed=\{active\}/);
  assert.match(register, /min-h-11/);
  assert.match(register, /mobileBoardStatus === status/);
  assert.match(register, /lg:grid-cols-3/);
  assert.doesNotMatch(
    register,
    /aria-label="Task Board"[\s\S]{0,200}overflow-x-auto/,
  );
});

test("mobile app header keeps 44px controls on one compact row", async () => {
  const styles = await source("../../src/app/globals.css");

  assert.match(
    styles,
    /@media \(max-width: 1023px\)[\s\S]*\.app-header-action[\s\S]*min-height: 2\.75rem/,
  );
  assert.match(
    styles,
    /\.app-header-dropdown > summary,[\s\S]*min-height: 2\.75rem/,
  );
  assert.doesNotMatch(
    styles,
    /@media \(max-width: 479px\)[\s\S]*\.app-header-inner[\s\S]{0,120}flex-wrap: wrap/,
  );
});

test("shared modal and global search retain viewport, focus, and mobile controls", async () => {
  const [modal, search] = await Promise.all([
    source("../../src/components/ui/modal.tsx"),
    source("../../src/components/search/global-search.tsx"),
  ]);

  assert.match(modal, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(modal, /overflow-y-auto/);
  assert.match(modal, /useDialogFocus/);
  assert.match(search, /aria-label="Åbn global søgning"/);
  assert.match(search, /initialFocusRef=\{inputRef\}/);
  assert.match(search, /min-h-11/);
  assert.match(search, /onNavigate=\{\(\) => setOpen\(false\)\}/);
});
