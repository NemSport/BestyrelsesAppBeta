import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { documentFileType, filterAndSortDocuments } from "../../src/lib/document-register.ts";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("overview searches, filters and sorts document metadata", () => {
  const items = [
    { name: "Budget 2027", description: "Årsbudget", categoryName: "Økonomi", committeeName: "Bestyrelsen", category_id: "economy", primary_committee_id: "board", created_at: "2026-01-01", updated_at: "2026-08-01", currentVersion: { mime_type: "application/pdf", file_name: "budget.pdf" } },
    { name: "Sponsoraftale", description: null, categoryName: "Kontrakter", committeeName: "Sponsorudvalg", category_id: "contract", primary_committee_id: "sponsor", created_at: "2025-01-01", updated_at: "2025-01-01", currentVersion: { mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", file_name: "aftale.docx" } },
  ];
  assert.equal(filterAndSortDocuments(items, { search: "årsbudget", category: "", committee: "", type: "", year: "", sort: "updated" })[0].name, "Budget 2027");
  assert.equal(filterAndSortDocuments(items, { search: "", category: "contract", committee: "sponsor", type: "DOCX", year: "2025", sort: "name-asc" }).length, 1);
  assert.equal(documentFileType("application/pdf", "referat.pdf"), "PDF");
});

test("migration creates one central document with immutable versions and polymorphic relations", async () => {
  const migration = await read("supabase/migrations/202608140001_documents_v2.sql");
  assert.match(migration, /create table public\.documents/);
  assert.match(migration, /create table public\.document_versions/);
  assert.match(migration, /create table public\.document_relations/);
  assert.match(migration, /unique \(document_id, version_number\)/);
  for (const type of ["organization", "committee", "meeting", "agenda_item", "task", "annual_wheel_event"]) assert.match(migration, new RegExp(`'${type}'`));
});

test("legacy attachments are backfilled without copying storage objects", async () => {
  const migration = await read("supabase/migrations/202608140001_documents_v2.sql");
  assert.match(migration, /from public\.meeting_minute_attachments/);
  assert.match(migration, /from public\.agenda_item_minute_attachments/);
  assert.match(migration, /'meeting-minute-attachments'/);
  assert.match(migration, /on conflict do nothing/g);
  assert.match(migration, /mirror_minutes_attachment_to_document/);
  assert.doesNotMatch(migration, /insert into public\.tasks/);
});

test("RLS isolates documents, relations, versions, categories and private storage", async () => {
  const migration = await read("supabase/migrations/202608140001_documents_v2.sql");
  for (const table of ["documents", "document_versions", "document_relations", "document_categories"]) assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration, /validate_document_scope/);
  assert.match(migration, /Dokumentrelationen krydser organisation/);
  assert.match(migration, /bucket_id = 'organization-documents'/);
  assert.match(migration, /can_read_document_storage_path/);
});

test("replace flow appends a version and keeps metadata and relations stable", async () => {
  const service = await read("src/services/document-service.ts");
  const migration = await read("supabase/migrations/202608140001_documents_v2.sql");
  assert.match(service, /repository\.addVersion/);
  assert.match(migration, /for update/);
  assert.match(migration, /next_version := target\.current_version_number \+ 1/);
  assert.doesNotMatch(service, /deleteRelation\(.+replace/s);
});

test("initial upload avoids insert returning RLS and remains cleanup-safe", async () => {
  const repository = await read("src/repositories/document-repository.ts");
  const service = await read("src/services/document-service.ts");
  const createDocument = repository.match(
    /async createDocument[\s\S]*?\n  }/,
  )?.[0] ?? "";
  const upload = service.match(/async upload[\s\S]*?\n  }\n\n  async replace/)?.[0] ?? "";

  assert.doesNotMatch(createDocument, /\.select\(/);
  assert.ok(upload.indexOf("createRelation(relation)") < upload.indexOf("repository.upload(path"));
  assert.ok(upload.indexOf("repository.upload(path") < upload.indexOf("repository.createVersion"));
  assert.ok(upload.indexOf("repository.createVersion") < upload.indexOf("return await this.repository.updateDocument"));
});

test("relation removal and document deletion are separate flows", async () => {
  const service = await read("src/services/document-service.ts");
  assert.match(service, /async removeRelation/);
  assert.match(service, /deleteRelation\(relationId\)/);
  assert.match(service, /async softDelete/);
  assert.match(service, /softDeleteDocument/);
});

test("ordinary committee members can upload while attachment deletion stays managed", async () => {
  const capability = await read("src/lib/meeting-capabilities.ts");
  const service = await read("src/services/meeting-minutes-service.ts");
  assert.match(capability, /uploadMinutesAttachments: editor/);
  assert.match(service, /uploadAttachment[\s\S]*requireCommitteeMember/);
  assert.match(service, /removeAttachment[\s\S]*manageMinutesAttachments/);
});

test("documents appear in global organization navigation and legacy context", async () => {
  const nav = await read("src/lib/organization-navigation.ts");
  const attachments = await read("src/components/meetings/minutes-governance.tsx");
  assert.match(nav, /Dokumenter.+\/documents/);
  assert.match(attachments, /Dokumentdetalje/);
  assert.match(attachments, /\/documents\/\$\{attachment\.id\}/);
});

test("private notes never participate in the document migration", async () => {
  const migration = await read("supabase/migrations/202608140001_documents_v2.sql");
  assert.doesNotMatch(migration, /private_(?:meeting|agenda_item)_notes/);
});

test("document overview follows the Version 3 dashboard composition", async () => {
  const register = await read("src/components/documents/document-register.tsx");
  const globals = await read("src/app/globals.css");
  for (const label of [
    "Dokumenter",
    "Kategorier",
    "Seneste opdatering",
    "Relationer",
    "Hurtige handlinger",
    "Seneste aktivitet",
  ]) {
    assert.match(register, new RegExp(label));
  }
  assert.match(register, /xl:grid-cols-\[minmax\(0,3\.2fr\)_minmax\(16rem,1fr\)\]/);
  assert.match(register, /md:grid-cols-\[minmax\(15rem,2\.2fr\)/);
  assert.match(register, /Nulstil filtre/);
  assert.match(register, /<ActionMenu/);
  assert.match(
    globals,
    /\[data-document-register-page\][\s\S]*?width: min\(100%, 96rem\);[\s\S]*?max-width: 96rem;/,
  );
});

test("document dashboard keeps a single-column mobile flow", async () => {
  const register = await read("src/components/documents/document-register.tsx");
  assert.match(register, /grid min-w-0 gap-4 xl:grid-cols/);
  assert.match(register, /div className="min-w-0 space-y-2\.5"/);
  assert.doesNotMatch(register, /<main\b/);
  assert.match(register, /aside className="grid w-full gap-3 xl:sticky/);
  assert.match(register, /truncate/);
  assert.doesNotMatch(register, /overflow-x-auto/);
});
