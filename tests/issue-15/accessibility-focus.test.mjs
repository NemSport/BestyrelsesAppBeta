import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [
  modal,
  dialogFocus,
  detailsFocus,
  organizationNav,
  quickActions,
  participants,
  resourceForm,
  feedback,
  table,
  styles,
] = await Promise.all([
  source("../../src/components/ui/modal.tsx"),
  source("../../src/hooks/use-dialog-focus.ts"),
  source("../../src/hooks/use-dismissible-details.ts"),
  source("../../src/components/layout/organization-nav.tsx"),
  source("../../src/components/layout/quick-action-menu.tsx"),
  source("../../src/components/meetings/meeting-participants-panel.tsx"),
  source("../../src/components/forms/resource-form.tsx"),
  source("../../src/components/ui/feedback-state.tsx"),
  source("../../src/components/ui/table.tsx"),
  source("../../src/app/globals.css"),
]);

test("shared dialogs trap focus, close on Escape, and restore focus", () => {
  assert.match(modal, /useDialogFocus/);
  assert.match(modal, /aria-describedby=\{description \? descriptionId/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /tabIndex=\{-1\}/);
  assert.match(organizationNav, /useDialogFocus/);
  assert.match(dialogFocus, /event\.key === "Escape"/);
  assert.match(dialogFocus, /event\.key !== "Tab"/);
  assert.match(dialogFocus, /event\.defaultPrevented \|\| !isTopmostDialog/);
  assert.match(dialogFocus, /dialog\.getClientRects\(\)\.length > 0/);
  assert.match(dialogFocus, /document\.body\.style\.overflow = "hidden"/);
  assert.match(dialogFocus, /returnTarget\?\.isConnected/);
});

test("global disclosures and quick actions have keyboard dismissal", () => {
  assert.match(detailsFocus, /event\.key === "Escape"/);
  assert.match(detailsFocus, /details\?\.addEventListener\("keydown"/);
  assert.match(detailsFocus, /summary"\)\?\.focus/);
  assert.match(quickActions, /aria-controls="quick-action-options"/);
  assert.match(quickActions, /closeOnEscape/);
  assert.match(quickActions, /closeOnOutsidePointer/);
  assert.doesNotMatch(quickActions, /role="menu(item)?"/);
});

test("core form controls retain labels, descriptions, and error relations", () => {
  for (const label of ["Navn", "E-mail", "Mobil", "Funktion eller notat"]) {
    assert.match(participants, new RegExp(`>${label}<|\\n\\s+${label}\\n`));
  }
  assert.match(resourceForm, /aria-labelledby=\{labelId\}/);
  assert.match(resourceForm, /\[helpId, errorId\]\.filter\(Boolean\)/);
  assert.match(resourceForm, /aria-describedby/);
  assert.match(resourceForm, /aria-invalid/);
});

test("feedback, tables, and focus indicators expose shared semantics", () => {
  assert.match(feedback, /tone === "danger" \? "alert"/);
  assert.match(feedback, /tone === "success" \? "status"/);
  assert.match(table, /scope = "col"/);
  assert.match(table, /role="region"/);
  assert.match(table, /tabIndex=\{tabIndex\}/);
  assert.match(styles, /:focus-visible[\s\S]*outline: 3px solid/);
  assert.match(styles, /\.field:focus-visible/);
  assert.match(styles, /\.rich-text-editor:focus-visible/);
});
