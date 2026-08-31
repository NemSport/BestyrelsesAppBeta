import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [migration, repository, service, api, picker, timeline, agendaPage, meetingPage] =
  await Promise.all([
    source(
      "../../supabase/migrations/202608090002_manual_agenda_item_history_link.sql",
    ),
    source("../../src/repositories/agenda-item-repository.ts"),
    source("../../src/services/agenda-item-service.ts"),
    source(
      "../../src/app/api/agenda-items/[agendaItemId]/history-link/route.ts",
    ),
    source(
      "../../src/components/agenda-items/agenda-item-history-link.tsx",
    ),
    source("../../src/components/agenda-items/agenda-item-history.tsx"),
    source(
      "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/agenda-items/[agendaItemId]/page.tsx",
    ),
    source(
      "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/meetings/[meetingId]/page.tsx",
    ),
  ]);

test("a singleton agenda item can explicitly adopt an existing target thread", () => {
  assert.match(migration, /create or replace function public\.link_agenda_item_to_history/);
  assert.match(
    migration,
    /set[\s\S]*agenda_item_thread_id = target_item\.agenda_item_thread_id/,
  );
  assert.match(migration, /expected_source_thread_id/);
  assert.match(repository, /\.rpc\("link_agenda_item_to_history"/);
});

test("history reads automatically include the newly linked item", () => {
  assert.match(repository, /\.eq\("agenda_item_thread_id", source\.agenda_item_thread_id\)/);
  assert.match(timeline, /agendaItemHistoryChangedEvent/);
  assert.match(picker, /window\.dispatchEvent/);
  assert.match(picker, /router\.refresh\(\)/);
});

test("search text only ranks candidates and never links matching titles automatically", () => {
  const searchMethod = repository.match(
    /async searchHistoryLinkCandidates[\s\S]*?\n  async linkToHistory/,
  )?.[0];
  assert.ok(searchMethod);
  assert.match(searchMethod, /normalizedHistorySearch/);
  assert.match(searchMethod, /matchingTreatments/);
  assert.match(picker, /Knyt til historik\?/);
  assert.match(picker, /Knyt sammen/);
  assert.doesNotMatch(searchMethod, /similarity\(|levenshtein|\.update\(/i);
});

test("RPC rejects cross-scope linking and requires existing editor permission", () => {
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /public\.can_edit_agenda_item\(target_committee_id\)/);
  assert.match(migration, /AGENDA_HISTORY_SCOPE_MISMATCH/);
  assert.match(service, /requireMeetingCapability[\s\S]*"updateAgendaItem"/);
});

test("source histories cannot be merged while target histories may contain many items", () => {
  assert.match(migration, /source_thread_member_count > 1/);
  assert.match(migration, /AGENDA_HISTORY_SOURCE_HAS_HISTORY/);
  assert.doesNotMatch(migration, /target_thread_member_count/);
  assert.match(service, /AGENDA_HISTORY_MERGE_NOT_SUPPORTED/);
  assert.match(picker, /Sammenkædning af to eksisterende historikker/);
});

test("self-link and same-thread requests are safe", () => {
  assert.match(migration, /source_agenda_item_id = target_agenda_item_id/);
  assert.match(migration, /AGENDA_HISTORY_SELF_LINK/);
  assert.match(
    migration,
    /source_item\.agenda_item_thread_id = target_item\.agenda_item_thread_id[\s\S]*return source_item/,
  );
});

test("deterministic locks and expected source identity protect concurrent changes", () => {
  assert.match(migration, /order by item\.id[\s\S]*for update/);
  assert.match(
    migration,
    /source_item\.agenda_item_thread_id <> expected_source_thread_id/,
  );
  assert.match(migration, /AGENDA_HISTORY_CONCURRENT_CHANGE/);
});

test("candidate search remains RLS-backed and scoped to one organization and committee", () => {
  const searchMethod = repository.match(
    /async searchHistoryLinkCandidates[\s\S]*?\n  async linkToHistory/,
  )?.[0];
  assert.ok(searchMethod);
  assert.match(searchMethod, /\.eq\("organization_id", input\.organizationId\)/);
  assert.match(searchMethod, /\.eq\("committee_id", input\.committeeId\)/);
  assert.match(searchMethod, /\.neq\("agenda_item_thread_id", input\.sourceThreadId\)/);
  assert.doesNotMatch(searchMethod, /service_role|createAdminClient/);
  assert.match(api, /searchHistoryLinkCandidates/);
});

test("candidate results are compact, prior-first and deduplicated by thread", () => {
  assert.match(repository, /treatmentsByThread/);
  assert.match(repository, /starts_at <= input\.beforeOrAt/);
  assert.match(repository, /meetingDate\.localeCompare/);
  assert.match(repository, /\.slice\(0, 20\)/);
  assert.match(picker, /Søg efter titel eller møde/);
  assert.match(picker, /candidate\.historyCount/);
});

test("the action is capability-gated in detail and meeting workspace", () => {
  assert.match(agendaPage, /\{canEdit \? \([\s\S]*<AgendaItemHistoryLink/);
  assert.match(meetingPage, /canEditAgendaItems=\{meetingCapabilities\.updateAgendaItem\}/);
  assert.match(picker, /Knyt til tidligere dagsordenspunkt/);
});

test("general immutability remains and only the controlled item-target pair is allowed", () => {
  assert.match(migration, /current_setting\('app\.agenda_item_history_link_item'/);
  assert.match(migration, /current_setting\('app\.agenda_item_history_link_target'/);
  assert.match(migration, /if not controlled_link then[\s\S]*historikreference kan ikke/);
  assert.match(migration, /revoke all on function public\.link_agenda_item_to_history/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
});

test("manual linking changes no transfer or child relation and copies no domain records", () => {
  const updateStatement = migration.match(
    /update public\.agenda_items item[\s\S]*?returning item\.\* into updated_item/,
  )?.[0];
  assert.ok(updateStatement);
  assert.doesNotMatch(updateStatement, /parent_id|transferred_agenda_items/);
  assert.doesNotMatch(updateStatement, /insert into|decisions|tasks|minutes|notes/);
});
