import assert from "node:assert/strict";
import test from "node:test";

import { DocumentRepository } from "@/repositories/document-repository";
import type { TableRow } from "@/types/database";

test("document agenda relations resolve the target committee in a single read", async () => {
  const relation = (id: string): TableRow<"document_relations"> => ({
    id: `relation-${id}`,
    organization_id: "organization",
    document_id: "document",
    relation_type: "agenda_item",
    committee_id: null,
    meeting_id: null,
    agenda_item_id: id,
    task_id: null,
    annual_wheel_event_id: null,
    stakeholder_id: null,
    stakeholder_contract_id: null,
    created_by: "user",
    created_at: "2026-11-11T00:00:00Z",
  });
  const target = {
    id: "active",
    title: "Godkendelse af dagsorden",
    organization_id: "organization",
    committee_id: "target-committee",
    deleted_at: null,
  };
  const db = {
    from(table: string) {
      assert.equal(table, "agenda_items");
      return {
        select(columns: string) {
          assert.match(columns, /organization_id, committee_id, deleted_at/);
          return {
            async in(column: string, ids: string[]) {
              assert.equal(column, "id");
              assert.deepEqual(ids, [
                "active",
                "deleted",
                "hidden",
                "other-org",
              ]);
              return {
                data: [
                  target,
                  { ...target, id: "deleted", deleted_at: "2026-11-11" },
                  { ...target, id: "other-org", organization_id: "other" },
                ],
                error: null,
              };
            },
          };
        },
      };
    },
  } as unknown as ConstructorParameters<typeof DocumentRepository>[0];

  const result = await new DocumentRepository(db).relationLabels(
    ["active", "deleted", "hidden", "other-org"].map(relation),
  );

  assert.deepEqual(
    result.map(({ label, agendaItemCommitteeId }) => [
      label,
      agendaItemCommitteeId,
    ]),
    [
      [target.title, "target-committee"],
      [target.title, null],
      ["Relateret element", null],
      ["Relateret element", null],
    ],
  );
});
