import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";
import { defaultPdfTemplateConfig, pdfTemplateConfigSchema, templateAssetsBelongTo, changeTemplateRect, templatePage } from "../../src/lib/pdf-template-config";
import { createPdfReport } from "../../src/lib/pdf-report";
import { pdfRect } from "../../src/lib/pdf-template";
import { generateIssue12Fixtures } from "../issue-12/pdf-fixtures";

const org = "11111111-1111-4111-8111-111111111111";
test("configuration rejects overlap and invalid geometry and keeps body widths aligned", () => {
  const config = defaultPdfTemplateConfig(true);
  assert.ok(pdfTemplateConfigSchema.safeParse(config).success);
  const changed = changeTemplateRect(config, "portrait", "first", "body", { ...config.portrait.first.body, x: 20, width: 170 });
  assert.equal(changed.portrait.continuation.body.width, 170);
  changed.portrait.first.body.y = 0;
  assert.equal(pdfTemplateConfigSchema.safeParse(changed).success, false);
  config.portrait.first.background = { kind: "image", path: `22222222-2222-4222-8222-222222222222/${org}.png` };
  assert.equal(templateAssetsBelongTo(config, org), false);
});

test("database enforces valid geometry, tenant asset scope and private Storage policies", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id serial primary key,bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated; grant select,insert on storage.objects to authenticated; grant usage on sequence storage.objects_id_seq to authenticated;
      create table organizations(id uuid primary key);
      create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
      create function public.is_organization_member(id uuid) returns boolean language sql as $$ select id::text = current_setting('test.organization') $$;
      create function public.is_organization_admin(id uuid) returns boolean language sql as $$ select public.is_organization_member(id) and current_setting('test.admin') = 'yes' $$;`);
    await db.exec(await readFile("supabase/migrations/202606210002_organization_branding_foundation.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/202611090002_pdf_template_configurator.sql", "utf8"));
    const config = defaultPdfTemplateConfig(true);
    await db.exec(`insert into organizations values ('${org}'); set role authenticated; set test.organization='${org}'; set test.admin='yes';`);
    await db.query("insert into organization_branding(organization_id,pdf_template) values ($1,$2)", [org, config]);
    config.portrait.first.body.y = 0;
    await assert.rejects(db.query("update organization_branding set pdf_template=$1", [config]));
    const bad = defaultPdfTemplateConfig(); bad.portrait.first.background = {kind:"image",path:`22222222-2222-4222-8222-222222222222/${org}.png`};
    await assert.rejects(db.query("update organization_branding set pdf_template=$1", [bad]));
    await db.query("insert into storage.objects(bucket_id,name) values ('organization-letterheads',$1)", [`${org}/${org}.png`]);
    await db.exec("set test.admin='no'");
    await db.exec("update organization_branding set pdf_template=null");
    assert.notEqual((await db.query<{ pdf_template: unknown }>("select pdf_template from organization_branding")).rows[0].pdf_template, null);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('organization-letterheads',$1)", [`${org}/${org}.jpg`]));
    await db.exec("set test.organization='22222222-2222-4222-8222-222222222222'");
    assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
    assert.equal((await db.query("select * from organization_branding")).rows.length, 0);
  } finally { await db.close(); }
});

test("compact continuation pages reduce page count without dropping text", async () => {
  const outputs = [];
  for (const configured of [false, true]) {
    const report = await createPdfReport({ documentType: "Referat", title: "Planlægning", branding: { pdfLetterhead: "vorbasse-marked", ...(configured ? { pdfTemplate: defaultPdfTemplateConfig(true) } : {}) } });
    for (let n = 0; n < 80; n++) report.addParagraph(`Afsnit ${n}. ` + "Ansvar, beslutning og opfølgning behandles på mødet. ".repeat(8));
    const bytes = await report.save();
    const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
    const texts = [];
    for (let i = 1; i <= pdf.numPages; i++) texts.push((await (await pdf.getPage(i)).getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" "));
    assert.ok(texts.join(" ").includes("Afsnit 79."));
    outputs.push(pdf.numPages); await pdf.destroy();
  }
  assert.ok(outputs[1] < outputs[0], `${outputs}`);
});

test("configured exports keep all text within the selected page areas", async () => {
  const config = defaultPdfTemplateConfig(true);
  const files = await generateIssue12Fixtures(undefined, config);
  await mkdir("output/pdf/template-tests", { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(`output/pdf/template-tests/${name}.pdf`, bytes);
    const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const orientation = page.view[2] > page.view[3] ? "landscape" : "portrait";
      const layout = templatePage(config, orientation, n - 1);
      const areas = [layout.header, layout.body, layout.footer].map((rect) => pdfRect(rect, page.view[3]));
      for (const item of (await page.getTextContent()).items) {
        if (!("str" in item) || !item.str.trim()) continue;
        assert.ok(areas.some((area) => item.transform[4] >= area.x - 1 && item.transform[4] + item.width <= area.x + area.width + 1 && item.transform[5] >= area.bottom - 1 && item.transform[5] + item.height <= area.top + 2), `${name}, page ${n}: outside area: ${item.str}`);
      }
    }
    assert.ok((await PDFDocument.load(bytes)).getPageCount());
    await pdf.destroy();
  }
});
