import { strict as assert } from "node:assert";
import { test } from "node:test";
import { advisorySources } from "../../src/lib/advisory-sources";
import type { GlobalSearchResult } from "../../src/lib/global-search";

test("the same question receives only the source records returned for each session", async () => {
  const shared: GlobalSearchResult = {
    id: "shared",
    type: "minutes",
    title: "Spillertøj",
    description: "Fælles drøftelse",
    href: "/shared",
    date: null,
    context: "Bestyrelsen",
    updatedAt: "2026-11-11",
  };
  const restricted = {
    ...shared,
    id: "restricted",
    href: "/restricted",
    title: "Lukket spillertøjsreferat",
    description: "Fortrolig leverandøraftale",
  };
  const question = "Har vi tidligere talt om spillertøj? Henvis til møderne.";
  const sourcesFor = (records: GlobalSearchResult[]) =>
    advisorySources(question, async (term) => ({
      groups:
        term === "spillertøj"
          ? [{ type: "minutes", label: "Referater", results: records }]
          : [],
    }));

  const [full, limited] = await Promise.all([
    sourcesFor([shared, restricted]),
    sourcesFor([shared]),
  ]);
  assert.deepEqual(
    full.map(({ href }) => href),
    ["/shared", "/restricted"],
  );
  assert.deepEqual(
    limited.map(({ href }) => href),
    ["/shared"],
  );
  assert.doesNotMatch(JSON.stringify(limited), /Lukket|Fortrolig|restricted/);
});
