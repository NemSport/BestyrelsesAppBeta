import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  agendaItemDraftAssistantRequestSchema,
  generateAgendaItemDraftSuggestion,
} from "../../src/lib/agenda-item-draft-assistant";
import {
  meetingMaterialDispatchSchema,
  tasksForRecipient,
} from "../../src/lib/meeting-material-dispatch";
import { richTextToPdfBlocks } from "../../src/lib/rich-text";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("rich-text PDF blocks preserve unordered, ordered, nested, and inline formatting", () => {
  const blocks = richTextToPdfBlocks(
    "<p>Afsnit<br>linje <strong>fed</strong> <em>kursiv</em></p><ul><li>Punkt<ul><li>Underpunkt</li></ul></li></ul><ol><li>Et</li><li>To</li></ol>",
  );
  assert.deepEqual(
    blocks.slice(1).map((block) => [
      block.text,
      block.ordered,
      block.index,
      block.depth,
    ]),
    [
      ["Punkt", false, undefined, 0],
      ["Underpunkt", false, undefined, 1],
      ["Et", true, 1, 0],
      ["To", true, 2, 0],
    ],
  );
  assert.ok(blocks[0]?.runs?.some((run) => run.bold && run.text === "fed"));
  assert.ok(blocks[0]?.runs?.some((run) => run.italic && run.text === "kursiv"));
});

test("existing document picker creates only a scoped relation and preserves versions", async () => {
  const [migration, service, picker] = await Promise.all([
    read("supabase/migrations/202608250003_attach_existing_documents.sql"),
    read("src/services/document-service.ts"),
    read("src/components/meetings/minutes-governance.tsx"),
  ]);
  assert.match(migration, /can_read_document\(target_document\.id\)/);
  assert.match(migration, /target_document\.organization_id/);
  assert.match(migration, /can_edit_agenda_item/);
  assert.match(migration, /insert into public\.document_relations/);
  assert.doesNotMatch(migration, /insert into public\.documents/);
  assert.doesNotMatch(migration, /insert into public\.document_versions/);
  const attachMethod =
    service.match(/async attachExisting[\s\S]*?async detachExisting/)?.[0] ?? "";
  assert.match(attachMethod, /target\.organizationId !== document\.organization_id/);
  assert.match(attachMethod, /repository\.attachExistingDocument/);
  assert.doesNotMatch(attachMethod, /addVersion|upload\(/);
  assert.match(picker, /Vælg fra dokumentbibliotek/);
  assert.match(picker, /pickerSearch/);
  assert.match(picker, /pickerCategory/);
  assert.match(picker, /attachExisting: true/);
});

test("dispatch schema supports agenda, minutes, documents, and general or personal tasks", () => {
  const base = {
    organizationId: "11111111-1111-4111-8111-111111111111",
    committeeId: "22222222-2222-4222-8222-222222222222",
    meetingId: "33333333-3333-4333-8333-333333333333",
    recipientMode: "selected" as const,
    recipientUserIds: ["44444444-4444-4444-8444-444444444444"],
    subject: "Mødemateriale",
    message: "",
  };
  assert.equal(
    meetingMaterialDispatchSchema.parse({
      ...base,
      contentTypes: ["agenda"],
    }).taskListMode,
    undefined,
  );
  assert.deepEqual(
    meetingMaterialDispatchSchema.parse({
      ...base,
      contentTypes: ["minutes"],
    }).contentTypes,
    ["minutes"],
  );
  assert.equal(
    meetingMaterialDispatchSchema.parse({
      ...base,
      contentTypes: ["tasks"],
      taskListMode: "general",
    }).taskListMode,
    "general",
  );
  assert.equal(
    meetingMaterialDispatchSchema.parse({
      ...base,
      contentTypes: ["minutes", "tasks"],
      taskListMode: "personal",
    }).taskListMode,
    "personal",
  );
  assert.throws(() =>
    meetingMaterialDispatchSchema.parse({
      ...base,
      contentTypes: ["tasks"],
    }),
  );
  const documentId = "55555555-5555-4555-8555-555555555555";
  assert.deepEqual(
    meetingMaterialDispatchSchema.parse({
      ...base,
      contentTypes: ["agenda"],
      includeAttachments: true,
      documentIds: [documentId],
    }).documentIds,
    [documentId],
  );
  assert.throws(() =>
    meetingMaterialDispatchSchema.parse({
      ...base,
      contentTypes: ["agenda"],
      includeAttachments: false,
      documentIds: [documentId],
    }),
  );
});

test("dispatch route, recipient selection, documents, and permissions stay server scoped", async () => {
  const [route, service, documentService, dispatchLib] = await Promise.all([
    read("src/app/api/meetings/[meetingId]/dispatch/route.ts"),
    read("src/services/meeting-material-dispatch-service.ts"),
    read("src/services/document-service.ts"),
    read("src/lib/meeting-material-dispatch.ts"),
  ]);
  assert.match(route, /meetingId: \(await params\)\.meetingId/);
  assert.match(service, /requireMeetingCapability[\s\S]*?"sendAgendaEmail"/);
  assert.match(service, /requireOrganizationMember/);
  assert.match(service, /member\.status === "active"/);
  assert.match(service, /resolveMeetingParticipantRecipients/);
  assert.match(service, /resolveSelectedMeetingMaterialRecipients/);
  assert.match(dispatchLib, /declined", "absent", "excused"/);
  assert.match(dispatchLib, /uniqueRecipients/);
  assert.match(service, /getDispatchDocuments/);
  assert.match(documentService, /DISPATCH_DOCUMENT_NOT_AVAILABLE/);
  assert.match(documentService, /18 \* 1024 \* 1024/);
  assert.match(documentService, /repository\.download/);
});

test("personal task lists are filtered independently for every recipient without copies", async () => {
  const tasks = [
    { id: "a", responsible_user_id: "mathias" },
    { id: "b", responsible_user_id: "peter" },
    { id: "c", responsible_user_id: null },
  ];
  assert.deepEqual(tasksForRecipient(tasks, "mathias").map((task) => task.id), ["a"]);
  assert.deepEqual(tasksForRecipient(tasks, "peter").map((task) => task.id), ["b"]);
  assert.deepEqual(tasksForRecipient(tasks, null), []);

  const service = await read("src/services/meeting-material-dispatch-service.ts");
  assert.match(service, /recipients\.map\(async \(recipient\)/);
  assert.match(service, /tasksForRecipient\(tasklist\.tasks, recipient\.userId\)/);
  assert.match(service, /taskListMode === "general"[\s\S]*?tasklist\.tasks/);
  assert.doesNotMatch(service, /createTask|insert\([^)]*tasks/);
});

test("dispatch history is immutable metadata and keeps canonical documents", async () => {
  const migration = await read(
    "supabase/migrations/202608250004_meeting_material_dispatches.sql",
  );
  assert.match(migration, /recipient_snapshot jsonb/);
  assert.match(migration, /document_snapshot jsonb/);
  assert.match(migration, /sender_id = auth\.uid\(\)/);
  assert.match(migration, /can_manage_committee\(committee_id\)/);
  assert.match(migration, /grant select, insert/);
  assert.doesNotMatch(migration, /for update|for delete/);
  assert.doesNotMatch(migration, /bytea|storage_path/);
});

test("agenda draft assistant uses a mockable provider and never mutates form text automatically", async () => {
  const calls: unknown[] = [];
  const result = await generateAgendaItemDraftSuggestion(
    {
      async generate(input) {
        calls.push(input);
        return { suggestion: "Et præcist forslag til formålet.", model: "mock" };
      },
    },
    {
      targetField: "objective",
      values: {
        title: "Budget 2027",
        itemType: "decision",
        objective: "Brugerens eksisterende tekst",
        description: "Baggrund",
      },
    },
  );
  assert.equal(result.suggestion, "Et præcist forslag til formålet.");
  assert.equal(calls.length, 1);
  await assert.rejects(
    generateAgendaItemDraftSuggestion(
      {
        async generate() {
          throw new Error("mock provider failed");
        },
      },
      {
        targetField: "description",
        values: {
          title: "Budget 2027",
          itemType: "decision",
          objective: "Formål",
          description: "Eksisterende baggrund",
        },
      },
    ),
    /mock provider failed/,
  );

  assert.throws(() =>
    agendaItemDraftAssistantRequestSchema.parse({
      organizationId: "11111111-1111-4111-8111-111111111111",
      committeeId: "22222222-2222-4222-8222-222222222222",
      targetField: "objective",
      values: { title: "Test", itemType: "discussion" },
      foreignOrganizationId: "33333333-3333-4333-8333-333333333333",
    }),
  );

  const [service, form] = await Promise.all([
    read("src/services/agenda-item-draft-assistant-service.ts"),
    read("src/components/forms/resource-form.tsx"),
  ]);
  assert.match(service, /requireAgendaItemEditor/);
  assert.match(service, /parsed\.values\.title\.length < 3/);
  assert.match(service, /AI_DRAFT_PROVIDER_FAILED/);
  assert.doesNotMatch(service, /errorMessage:/);
  assert.match(form, /AI-forslag · ikke gemt/);
  assert.match(form, /Brug forslag/);
  assert.match(form, /Generer nyt/);
  assert.match(form, /Ignorer/);
  assert.match(
    form,
    /onClick=\{\(\) => \{[\s\S]{0,500}setFieldValues[\s\S]{0,500}suggestion\.suggestion/,
  );
  const requestSuggestion =
    form.match(/async function requestSuggestion[\s\S]*?\n  }/)?.[0] ?? "";
  assert.doesNotMatch(requestSuggestion, /setFieldValues/);
});

test("Version 3.12 stakeholder task canonical fields remain intact", async () => {
  const [taskService, taskModal, migration] = await Promise.all([
    read("src/services/task-service.ts"),
    read("src/components/tasks/task-create-modal.tsx"),
    read("supabase/migrations/202608250002_stakeholder_integrations.sql"),
  ]);
  for (const source of [taskService, taskModal, migration]) {
    assert.match(source, /stakeholder(?:_|I)d/);
    assert.match(source, /stakeholder_contract_id|stakeholderContractId/);
  }
  assert.doesNotMatch(migration, /create table public\.stakeholder_tasks/);
});
