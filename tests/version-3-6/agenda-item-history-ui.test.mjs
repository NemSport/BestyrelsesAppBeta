import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [
  component,
  inlineDisclosure,
  meetingWorkspace,
  agendaPage,
  apiRoute,
  repository,
  modal,
] =
  await Promise.all([
    source("../../src/components/agenda-items/agenda-item-history.tsx"),
    source(
      "../../src/components/agenda-items/agenda-item-history-read-mode.tsx",
    ),
    source("../../src/components/meetings/meeting-minutes-section.tsx"),
    source(
      "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/agenda-items/[agendaItemId]/page.tsx",
    ),
    source(
      "../../src/app/api/agenda-items/[agendaItemId]/history/route.ts",
    ),
    source("../../src/repositories/agenda-item-repository.ts"),
    source("../../src/components/ui/modal.tsx"),
  ]);

test("history control is hidden for one visible treatment and shows the RLS-visible count", () => {
  assert.match(component, /history\.entries\.length < 2\) return null/);
  assert.match(component, /Se historik \(\{history\.entries\.length\}\)/);
  assert.doesNotMatch(component, /totalCount|unfilteredCount/);
});

test("the active workspace point uses the compact lazy inline disclosure", () => {
  assert.match(meetingWorkspace, /<AgendaItemHistoryReadMode/);
  assert.match(meetingWorkspace, /currentOccurrenceId=\{occurrence\.id\}/);
  assert.match(meetingWorkspace, /historyMetadata\.historyCount >= 2/);
  assert.match(meetingWorkspace, /compact/);
  assert.doesNotMatch(meetingWorkspace, /<AgendaItemHistory\s/);
  assert.match(inlineDisclosure, /fetch\([\s\S]*\/history\?organizationId=/);
  assert.match(inlineDisclosure, /!history && !loading/);
  assert.doesNotMatch(inlineDisclosure, /window\.location\.reload/);
});

test("the agenda-item page reuses server-loaded history", () => {
  assert.match(agendaPage, /getAgendaItemHistory\(/);
  assert.match(agendaPage, /initialHistory=\{agendaItemHistory\}/);
});

test("timeline marks current and future treatments while preserving individual titles", () => {
  assert.match(component, /entry\.occurrenceId === currentOccurrenceId/);
  assert.match(component, />Aktuel behandling</);
  assert.match(component, />Planlagt</);
  assert.match(component, /\{entry\.title\}/);
  assert.match(component, /agendaItemTypeLabels\[entry\.type\]\.short/);
  assert.match(component, /Punkt \$\{entry\.agendaItemNumber\}/);
});

test("previous treatments use the existing meeting occurrence deep-link", () => {
  assert.match(component, /getMeetingAgendaPointHref\(\{/);
  assert.match(component, /meetingId: entry\.meetingId/);
  assert.match(component, /occurrenceId: entry\.occurrenceId/);
  assert.match(component, /Se behandling fra \$\{formatHistoryDate/);
  assert.match(component, /!isCurrent && treatmentHref/);
});

test("history API stays behind the authenticated service and existing RLS", () => {
  assert.match(apiRoute, /AgendaItemService/);
  assert.match(apiRoute, /getAgendaItemHistory/);
  assert.doesNotMatch(apiRoute, /service_role|createAdminClient/);
  assert.match(repository, /\.eq\("agenda_item_thread_id"/);
  assert.match(repository, /\.eq\("organization_id", input\.organizationId\)/);
  assert.match(repository, /\.eq\("committee_id", input\.committeeId\)/);
});

test("decisions and open task counts are bulk-loaded without row-level queries", () => {
  assert.match(repository, /Promise\.all\(\[/);
  assert.match(repository, /\.from\("decisions"\)/);
  assert.match(repository, /\.from\("tasks"\)/);
  assert.match(repository, /\.in\("agenda_item_id", agendaItemIds\)/);
  assert.match(component, /entry\.decisions\.slice\(0, 2\)/);
  assert.match(component, /entry\.openTaskCount/);
});

test("the shared modal provides sheet scrolling, dialog semantics and focus handling", () => {
  assert.match(component, /placement="right"/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /useDialogFocus/);
  assert.match(modal, /overflow-y-auto/);
});
