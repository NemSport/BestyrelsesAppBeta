import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  deduplicateGlobalSearchResults,
  globalSearchCategories,
  globalSearchHref,
  highlightedSearchParts,
  normalizeGlobalSearchQuery,
  rankGlobalSearchResults,
  shouldApplyGlobalSearchResponse,
  toPostgrestSearchTerm,
  type GlobalSearchResult,
} from "../../src/lib/global-search";

const root = process.cwd();
const source = (path: string) => readFileSync(`${root}/${path}`, "utf8");

test("case-insensitive normalization and deterministic title-first ranking", () => {
  assert.equal(normalizeGlobalSearchQuery("  Budget   2027 "), "Budget 2027");
  const base = {
    type: "tasks" as const,
    context: "Økonomi",
    date: null,
    href: "/tasks",
  };
  const results: GlobalSearchResult[] = [
    {
      ...base,
      id: "body",
      title: "Plan",
      description: "Budget",
      updatedAt: "2026-08-19",
    },
    {
      ...base,
      id: "contains",
      title: "Nyt budget",
      description: null,
      updatedAt: "2026-08-18",
    },
    {
      ...base,
      id: "starts",
      title: "Budgetforslag",
      description: null,
      updatedAt: "2026-08-17",
    },
    {
      ...base,
      id: "exact",
      title: "BUDGET",
      description: null,
      updatedAt: "2026-08-16",
    },
  ];
  assert.deepEqual(
    rankGlobalSearchResults(results, "budget").map((item) => item.id),
    ["exact", "starts", "contains", "body"],
  );
});

test("ranking handles Danish letters, partial words and recency deterministically", () => {
  const base = {
    type: "agenda_items" as const,
    context: "Bestyrelsen",
    date: null,
    href: "/item",
    description: null,
  };
  const results: GlobalSearchResult[] = [
    { ...base, id: "older", title: "Økonomi", updatedAt: "2026-08-01" },
    { ...base, id: "newer", title: "økonomi", updatedAt: "2026-08-19" },
    { ...base, id: "partial", title: "Årsøkonomi", updatedAt: "2026-08-20" },
  ];
  assert.deepEqual(
    rankGlobalSearchResults(results, "ØKONOMI").map((item) => item.id),
    ["newer", "older", "partial"],
  );
  assert.equal(rankGlobalSearchResults(results, "økono")[0]?.id, "newer");
});

test("query edge cases are bounded and PostgREST control characters are neutralized", () => {
  assert.equal(normalizeGlobalSearchQuery("   "), "");
  assert.equal(normalizeGlobalSearchQuery("ø"), "ø");
  assert.equal(normalizeGlobalSearchQuery("x".repeat(500)).length, 120);
  assert.equal(
    toPostgrestSearchTerm("%'_\"<script>; DROP TABLE"),
    "script DROP TABLE",
  );
  assert.equal(toPostgrestSearchTerm("Budget 2026/2027"), "Budget 2026/2027");
});

test("duplicate entities are removed per result type without merging distinct intentions", () => {
  const base = {
    title: "Budget",
    description: null,
    context: "Bestyrelsen",
    date: null,
    href: "/",
    updatedAt: "2026-08-19",
  };
  const results = deduplicateGlobalSearchResults([
    { ...base, id: "same", type: "agenda_items" },
    { ...base, id: "same", type: "agenda_items" },
    { ...base, id: "same", type: "decisions" },
  ]);
  assert.deepEqual(
    results.map((result) => result.type),
    ["agenda_items", "decisions"],
  );
});

test("only the newest request sequence can update the palette", () => {
  assert.equal(shouldApplyGlobalSearchResponse(4, 4), true);
  assert.equal(shouldApplyGlobalSearchResponse(3, 4), false);
});

test("canonical result destinations preserve existing routes", () => {
  assert.equal(
    globalSearchHref({
      type: "agenda_item",
      organizationId: "org",
      committeeId: "committee",
      agendaItemId: "item",
    }),
    "/organizations/org/committees/committee/agenda-items/item",
  );
  assert.equal(
    globalSearchHref({
      type: "meeting_minutes",
      organizationId: "org",
      committeeId: "committee",
      meetingId: "meeting",
    }),
    "/organizations/org/committees/committee/meetings/meeting#general-minutes-heading",
  );
  assert.equal(
    globalSearchHref({
      type: "agenda_item",
      organizationId: "org",
      committeeId: "committee",
      agendaItemId: "transferred-item",
    }),
    "/organizations/org/committees/committee/agenda-items/transferred-item",
  );
  assert.equal(
    globalSearchHref({
      type: "decision",
      organizationId: "org",
      decisionId: "decision",
      committeeId: "committee",
      agendaItemId: "item",
      meetingId: "meeting",
    }),
    "/organizations/org/committees/committee/agenda-items/item",
  );
  assert.equal(
    globalSearchHref({
      type: "decision",
      organizationId: "org",
      decisionId: "decision",
      committeeId: "committee",
      agendaItemId: null,
      meetingId: "meeting",
    }),
    "/organizations/org/committees/committee/meetings/meeting",
  );
  assert.equal(
    globalSearchHref({ type: "task", organizationId: "org", taskId: "task" }),
    "/organizations/org/tasks?scope=all&editTask=task#task-task",
  );
  assert.equal(
    globalSearchHref({
      type: "document",
      organizationId: "org",
      documentId: "document",
    }),
    "/organizations/org/documents/document",
  );
});

test("highlighting returns React-safe text parts without HTML", () => {
  assert.deepEqual(highlightedSearchParts("Budget <script>", "budget"), [
    { text: "Budget", match: true },
    { text: " <script>", match: false },
  ]);
});

test("UI provides trigger, shortcuts, autofocus, Escape, filters and stale-request protection", () => {
  const component = source("src/components/search/global-search.tsx");
  const shell = source("src/components/layout/app-shell.tsx");
  const modal = source("src/components/ui/modal.tsx");
  assert.match(shell, /<GlobalSearch \/>/);
  assert.match(component, /event\.metaKey/);
  assert.match(component, /event\.ctrlKey/);
  assert.match(component, /initialFocusRef=\{inputRef\}/);
  assert.match(modal, /onEscape: onClose/);
  assert.match(component, /AbortController/);
  assert.match(component, /requestSequence/);
  assert.match(component, /requestSequence\.current \+= 1/);
  assert.match(component, /app-header-action-label/);
  assert.match(component, /maxWidth="3xl"/);
  assert.deepEqual(globalSearchCategories, [
    "all",
    "meetings",
    "agenda_items",
    "minutes",
    "decisions",
    "tasks",
    "documents",
    "stakeholders",
    "annual_wheel",
  ]);
});

test("server search is organization-scoped, membership checked, grouped, capped and excludes private notes", () => {
  const service = source("src/services/global-search-service.ts");
  const repository = source("src/repositories/global-search-repository.ts");
  assert.match(
    service,
    /requireOrganizationMember\(input\.organizationId, user\.id\)/,
  );
  assert.match(repository, /\.eq\("organization_id", organizationId\)/);
  assert.match(repository, /const candidateLimit = 24/);
  assert.match(
    service,
    /rankGlobalSearchResults\(deduplicateGlobalSearchResults\(results\), query\)/,
  );
  assert.match(
    service,
    /ranked\.length \? \[\{ type, label: globalSearchLabels\[type\], results: ranked \}\] : \[\]/,
  );
  assert.doesNotMatch(repository, /agenda_item_private_notes/);
  assert.doesNotMatch(service, /agenda_item_private_notes/);
});

test("organization changes clear query, filters, results and invalidate in-flight responses", () => {
  const component = source("src/components/search/global-search.tsx");
  assert.match(component, /setOpen\(false\)/);
  assert.match(component, /setQuery\(""\)/);
  assert.match(component, /setCategory\("all"\)/);
  assert.match(component, /setResponse\(\{ query: "", groups: \[\] \}\)/);
  assert.match(component, /controller\.abort\(\)/);
  assert.match(component, /shouldApplyGlobalSearchResponse/);
});

test("mobile structure keeps full-width dialog, internal scroll, horizontal chips and touch targets", () => {
  const component = source("src/components/search/global-search.tsx");
  const modal = source("src/components/ui/modal.tsx");
  assert.match(modal, /max-h-\[calc\(100dvh-2rem\)\] w-full/);
  assert.match(modal, /overflow-y-auto/);
  assert.match(component, /overflow-x-auto/);
  assert.match(component, /min-h-11/);
  assert.match(
    component,
    /event\.target\.value\.slice\(0, globalSearchQueryMaxLength\)/,
  );
  assert.match(component, /truncate text-sm font-semibold/);
  assert.match(component, /line-clamp-2/);
});

test("only approved meeting minutes make agenda minutes official", () => {
  const repository = source("src/repositories/global-search-repository.ts");
  const service = source("src/services/global-search-service.ts");
  assert.match(repository, /\.eq\("status", "approved"\)/);
  assert.match(service, /approvedMeetingIds\.has\(row\.meeting_id\)/);
});
