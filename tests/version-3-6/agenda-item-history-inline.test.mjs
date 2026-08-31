import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getInitialExpandedAgendaHistoryIds } from "../../src/lib/agenda-item-history.ts";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [inlineHistory, agendaPage, repository, historyLink] = await Promise.all([
  source("../../src/components/agenda-items/agenda-item-history-inline.tsx"),
  source(
    "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/agenda-items/[agendaItemId]/page.tsx",
  ),
  source("../../src/repositories/agenda-item-repository.ts"),
  source("../../src/components/agenda-items/agenda-item-history-link.tsx"),
]);

function entry(id) {
  return { id: `item-${id}`, occurrenceId: `occurrence-${id}` };
}

test("one treatment hides inline history while two treatments show the RLS-visible count", () => {
  assert.match(inlineHistory, /history\.entries\.length < 2\) return null/);
  assert.match(inlineHistory, />\s*Historik\s*</);
  assert.match(
    inlineHistory,
    /\{history\.entries\.length\} behandlinger af denne sag/,
  );
  assert.doesNotMatch(inlineHistory, /totalCount|unfilteredCount/);
});

test("agenda detail uses one inline history experience after the assistant", () => {
  assert.match(
    agendaPage,
    /<AgendaItemAssistant[\s\S]*<AgendaItemHistoryInline[\s\S]*title="Tidligere beslutninger om dette emne"/,
  );
  assert.doesNotMatch(agendaPage, /<AgendaItemHistory\s/);
  assert.doesNotMatch(agendaPage, /Historisk kontekst/);
  assert.doesNotMatch(agendaPage, /Hver mødeforekomst forbliver knyttet/);
});

test("two or three treatments expand by default while long histories open only the current treatment", () => {
  assert.deepEqual(
    getInitialExpandedAgendaHistoryIds(
      [entry("1"), entry("2")],
      "occurrence-2",
    ),
    ["occurrence-1", "occurrence-2"],
  );
  assert.deepEqual(
    getInitialExpandedAgendaHistoryIds(
      [entry("1"), entry("2"), entry("3"), entry("4")],
      "occurrence-3",
    ),
    ["occurrence-3"],
  );
});

test("accordion headers retain chronology metadata, historical titles and current/future states", () => {
  assert.match(inlineHistory, /history\.entries\.map/);
  assert.match(inlineHistory, /formatHistoryDate\(entry\.meetingDate\)/);
  assert.match(inlineHistory, /entry\.meetingTitle/);
  assert.match(inlineHistory, /Punkt \$\{entry\.agendaItemNumber\}/);
  assert.match(inlineHistory, /agendaItemTypeLabels\[entry\.type\]\.short/);
  assert.match(inlineHistory, /\{entry\.title\}/);
  assert.match(inlineHistory, />Aktuel behandling</);
  assert.match(inlineHistory, />Planlagt</);
});

test("accordion is keyboard-accessible and mobile-safe", () => {
  assert.match(inlineHistory, /aria-expanded=\{expanded\}/);
  assert.match(inlineHistory, /aria-controls=\{panelId\}/);
  assert.match(inlineHistory, /type="button"/);
  assert.match(inlineHistory, /focus-visible:ring-2/);
  assert.match(inlineHistory, /flex-wrap/);
  assert.match(inlineHistory, /min-w-0/);
  assert.doesNotMatch(inlineHistory, /overflow-x-auto|whitespace-nowrap/);
});

test("expanded treatment renders shared rich text, decisions, follow-up, transfer and tasks", () => {
  assert.match(inlineHistory, /<TreatmentContent entry=\{entry\}/);
  assert.match(inlineHistory, /"Baggrund" : "Formål"/);
  assert.match(inlineHistory, />\s*Referat \/ noter/);
  assert.match(inlineHistory, />\s*Beslutninger/);
  assert.match(inlineHistory, />\s*Opfølgning/);
  assert.match(inlineHistory, />\s*Relaterede opgaver/);
  assert.match(inlineHistory, /entry\.decisions\.map/);
  assert.match(inlineHistory, /entry\.tasks\.map/);
  assert.match(inlineHistory, /agendaItemTransferReasonLabels/);
});

test("rich text goes through the shared sanitizer and private notes are absent", () => {
  assert.match(inlineHistory, /<RichTextContent/);
  assert.match(
    inlineHistory,
    /value=\{hasNotes \? entry\.minutes\?\.notes : entry\.outcomeSummary\}/,
  );
  assert.match(inlineHistory, /value=\{entry\.minutes\?\.followUp\}/);
  assert.match(agendaPage, /<RichTextContent[\s\S]*value=\{item\.objective\}/);
  assert.match(agendaPage, /<RichTextContent[\s\S]*value=\{item\.description\}/);
  assert.doesNotMatch(inlineHistory, /private[_ A-Z-]?note/i);
  assert.doesNotMatch(repository, /agenda_item_private_notes/);
});

test("full treatment data is bulk-loaded in a constant number of scoped queries", () => {
  const historyMethod = repository.match(
    /async getAgendaItemHistory[\s\S]*?\n  async getAgendaItemHistoryMetadataBatch/,
  )?.[0];
  assert.ok(historyMethod);
  assert.match(historyMethod, /Promise\.all\(\[/);
  assert.match(historyMethod, /\.from\("agenda_item_minutes"\)/);
  assert.match(historyMethod, /\.from\("decisions"\)/);
  assert.match(historyMethod, /\.from\("tasks"\)/);
  assert.match(historyMethod, /\.from\("transferred_agenda_items"\)/);
  assert.match(historyMethod, /\.in\("agenda_item_id", agendaItemIds\)/);
  assert.match(historyMethod, /const treatmentKey = `\$\{item\.id\}:\$\{occurrence\.meetings!\.id\}`/);
  assert.doesNotMatch(
    historyMethod,
    /visibleOccurrences\.map[\s\S]*?await this\.db/,
  );
  assert.doesNotMatch(historyMethod, /internal_note|private_note/);
});

test("optional meeting navigation uses meetingId plus occurrenceId", () => {
  assert.match(inlineHistory, /getMeetingAgendaPointHref\(\{/);
  assert.match(inlineHistory, /meetingId: entry\.meetingId/);
  assert.match(inlineHistory, /occurrenceId: entry\.occurrenceId/);
  assert.match(inlineHistory, /Åbn i mødet/);
});

test("manual linking refreshes inline history without a page reload", () => {
  assert.match(historyLink, /agendaItemHistoryChangedEvent/);
  assert.match(inlineHistory, /addEventListener\(agendaItemHistoryChangedEvent/);
  assert.match(inlineHistory, /\/history\?organizationId=/);
  assert.doesNotMatch(inlineHistory, /window\.location\.reload/);
});
