import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { organizationBrandingInputSchema } from "../../src/lib/organization-branding";
import { resolveEmailTemplateBranding } from "../../src/lib/email-branding";
import { generateIssue12Fixtures } from "../issue-12/pdf-fixtures";

test("only the fixed preset is accepted; emails ignore letterhead", () => {
  const base = { organizationId: "11111111-1111-4111-8111-111111111111" };
  assert.equal(organizationBrandingInputSchema.parse({ ...base, pdfLetterhead: "" }).pdfLetterhead, null);
  assert.equal(organizationBrandingInputSchema.safeParse({ ...base, pdfLetterhead: "https://example.test/a.png" }).success, false);
  assert.deepEqual(resolveEmailTemplateBranding({ pdf_letterhead: "vorbasse-marked" } as never, "Test"), resolveEmailTemplateBranding(null, "Test"));
});

test("existing RLS isolates the preset and restricts writes to Organization admins", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table public.organizations(id uuid primary key);
      create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
      create function public.is_organization_member(id uuid) returns boolean language sql as $$ select id::text = current_setting('test.organization') $$;
      create function public.is_organization_admin(id uuid) returns boolean language sql as $$ select public.is_organization_member(id) and current_setting('test.admin') = 'yes' $$;
    `);
    await db.exec(await readFile("supabase/migrations/202606210002_organization_branding_foundation.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/202611090001_organization_pdf_letterhead.sql", "utf8"));
    await db.exec(`
      insert into organizations values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
      insert into organization_branding (organization_id) select id from organizations;
      set role authenticated;
      set test.organization = '11111111-1111-4111-8111-111111111111'; set test.admin = 'yes';
      update organization_branding set pdf_letterhead = 'vorbasse-marked';
    `);
    assert.equal((await db.query("select * from organization_branding")).rows.length, 1);
    await db.exec("set test.admin = 'no'; update organization_branding set pdf_letterhead = null;");
    assert.equal((await db.query<{pdf_letterhead:string}>("select pdf_letterhead from organization_branding")).rows[0].pdf_letterhead, "vorbasse-marked");
    await db.exec("set test.organization = '22222222-2222-4222-8222-222222222222';");
    assert.equal((await db.query<{pdf_letterhead:string|null}>("select pdf_letterhead from organization_branding")).rows[0].pdf_letterhead, null);
    await db.exec("set test.admin = 'yes';");
    await assert.rejects(db.exec("update organization_branding set pdf_letterhead = '../other.png'"));
  } finally { await db.close(); }
});

test("all seven exports paginate long content above the decorative footer", async () => {
  const files = await generateIssue12Fixtures("vorbasse-marked");
  await mkdir("output/pdf/letterhead-tests", { recursive: true });
  assert.equal(Object.keys(files).length, 7);
  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(`output/pdf/letterhead-tests/${name}.pdf`, bytes);
    const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
    try {
      assert.ok(pdf.numPages > 1, name);
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const landscape = page.view[2] > page.view[3];
        const floor = landscape ? 128 : 228;
        const content = await page.getTextContent();
        for (const item of content.items) {
          if (!("str" in item) || !item.str.trim()) continue;
          assert.ok(item.transform[5] >= floor, `${name} page ${n}: overlaps decoration: ${item.str}`);
          assert.ok(item.transform[4] + item.width <= page.view[2] - 20, `${name} page ${n}: overflows width: ${item.str}`);
        }
      }
    } finally { await pdf.destroy(); }
  }
});
