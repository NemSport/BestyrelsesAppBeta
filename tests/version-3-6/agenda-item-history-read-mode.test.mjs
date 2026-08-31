import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [wrapper, inlineHistory, minutes, meetingPage, repository, service, validation] =
  await Promise.all([
    source(
      "../../src/components/agenda-items/agenda-item-history-read-mode.tsx",
    ),
    source("../../src/components/agenda-items/agenda-item-history-inline.tsx"),
    source("../../src/components/meetings/meeting-minutes-section.tsx"),
    source(
      "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/meetings/[meetingId]/page.tsx",
    ),
    source("../../src/repositories/agenda-item-repository.ts"),
    source("../../src/services/agenda-item-service.ts"),
    source("../../src/lib/validation.ts"),
  ]);

test("read mode places a compact history disclosure below each official agenda treatment", () => {
  assert.match(minutes, /<AgendaItemHistoryReadMode/);
  assert.match(minutes, /currentOccurrenceId=\{occurrence\.id\}/);
  assert.match(minutes, /agendaItemId=\{item\.id\}/);
  assert.match(wrapper, /Historik · \{metadata\.historyCount\} behandlinger/);
  assert.match(wrapper, /metadata\.historyCount < 2\) return null/);
});

test("outer disclosure is collapsed, accessible and mobile-safe by default", () => {
  assert.match(wrapper, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(wrapper, /aria-expanded=\{open\}/);
  assert.match(wrapper, /Vis"\} historik med/);
  assert.match(wrapper, /w-full/);
  assert.doesNotMatch(wrapper, /overflow-x-auto|whitespace-nowrap/);
});

test("complete history is lazy-loaded on first open and cached for later re-open", () => {
  assert.match(wrapper, /if \(nextOpen && !history && !loading\)/);
  assert.match(wrapper, /\/api\/agenda-items\/\$\{agendaItemId\}\/history/);
  assert.match(wrapper, /setHistory\(result\)/);
  assert.doesNotMatch(meetingPage, /getAgendaItemHistory\([^M]/);
});

test("lazy loading and retry errors remain local to the disclosure", () => {
  assert.match(wrapper, /Indlæser historik…/);
  assert.match(wrapper, /Historikken kunne ikke indlæses\./);
  assert.match(wrapper, /Prøv igen/);
  assert.match(meetingPage, /getAgendaItemHistoryMetadataBatch[\s\S]*?\.catch\(\(\) => \[\]\)/);
});

test("batch metadata validates, caps and deduplicates agenda item ids", () => {
  assert.match(validation, /agendaItemHistoryMetadataBatchSchema/);
  assert.match(validation, /\.array\(uuidSchema\)/);
  assert.match(validation, /\.max\(100,/);
  assert.match(validation, /\[\.\.\.new Set\(ids\)\]/);
  assert.match(service, /agendaItemHistoryMetadataBatchSchema\.parse\(input\)/);
});

test("meeting read mode requests metadata once for the whole occurrence list", () => {
  assert.match(meetingPage, /getAgendaItemHistoryMetadataBatch\(\{/);
  assert.match(
    meetingPage,
    /agendaItemIds: meeting\.agenda_item_occurrences\.map/,
  );
  assert.doesNotMatch(
    meetingPage,
    /agenda_item_occurrences\.map\([\s\S]{0,300}getAgendaItemHistoryMetadataBatch/,
  );
});

test("repository metadata loading uses two scoped set queries and no per-item query", () => {
  const method = repository.match(
    /async getAgendaItemHistoryMetadataBatch[\s\S]*?\n  async countActiveThreadMembers/,
  )?.[0];
  assert.ok(method);
  assert.equal((method.match(/\.from\("agenda_items"\)/g) ?? []).length, 2);
  assert.match(method, /\.in\("id", input\.agendaItemIds\)/);
  assert.match(method, /\.in\("agenda_item_thread_id", threadIds\)/);
  assert.match(method, /\.eq\("organization_id", input\.organizationId\)/);
  assert.match(method, /\.eq\("committee_id", input\.committeeId\)/);
  assert.doesNotMatch(method, /for[\s\S]*?await this\.db/);
});

test("missing or RLS-hidden items are omitted while counts use visible treatments", () => {
  assert.match(repository, /if \(sources\.length === 0\) return \[\]/);
  assert.match(repository, /!occurrence\.deleted_at/);
  assert.match(repository, /occurrence\.meetings !== null/);
  assert.match(repository, /!occurrence\.meetings\.deleted_at/);
  assert.doesNotMatch(repository, /service[_-]?role/i);
});

test("read mode reuses the existing inline treatment timeline without linking controls", () => {
  assert.match(wrapper, /<AgendaItemHistoryInline/);
  assert.match(wrapper, /presentation="embedded"/);
  assert.doesNotMatch(wrapper, /AgendaItemHistoryLink|Knyt til tidligere/);
});

test("the selected read-mode occurrence, not the newest treatment, is current", () => {
  assert.match(wrapper, /currentOccurrenceId=\{currentOccurrenceId\}/);
  assert.match(inlineHistory, /entry\.occurrenceId === currentOccurrenceId/);
  assert.match(inlineHistory, />Aktuel behandling</);
});

test("planned state uses actual meeting status and date", () => {
  assert.match(inlineHistory, /entry\.meetingStatus === "draft"/);
  assert.match(inlineHistory, /entry\.meetingStatus === "scheduled"/);
  assert.match(inlineHistory, /new Date\(entry\.meetingDate\)\.getTime\(\) > Date\.now\(\)/);
  assert.doesNotMatch(inlineHistory, /currentOccurrenceId[\s\S]{0,100}Date\.now/);
});

test("shared timeline keeps safe rich text, treatment data and canonical navigation", () => {
  assert.match(inlineHistory, /<RichTextContent/);
  assert.match(inlineHistory, /entry\.decisions\.map/);
  assert.match(inlineHistory, /entry\.tasks\.map/);
  assert.match(inlineHistory, /agendaItemTransferReasonLabels/);
  assert.match(inlineHistory, /getMeetingAgendaPointHref\(\{/);
  assert.match(inlineHistory, /meetingId: entry\.meetingId/);
  assert.match(inlineHistory, /occurrenceId: entry\.occurrenceId/);
  assert.doesNotMatch(inlineHistory, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(inlineHistory, /private[_ A-Z-]?note/i);
});
