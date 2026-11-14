import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  proposeSponsors,
  type SponsorRecord,
  type SponsorRow,
} from "../../src/lib/sponsor-import";

const organization = "00000000-0000-4000-8000-000000000001";
const sponsor = "00000000-0000-4000-8000-000000000002";
const row = (fields: SponsorRow["fields"]): SponsorRow => ({
  source: "Test",
  row: 2,
  fields,
  details: [],
  warnings: [],
});
const current: SponsorRecord = {
  id: sponsor,
  name: "Sponsor A",
  cvr_number: "12345678",
  phone: "12345678",
  address_line: "Testvej 5",
  postal_code: "6623",
  city: "Vorbasse",
  notes: null,
  email: "old@example.test",
  internal_owner_user_id: null,
  updated_at: "2026-11-14T10:00:00Z",
  archived_at: null,
};

test("strong matches are preselected, name-only matches and duplicates require review", () => {
  const [update] = proposeSponsors(
    [
      row({
        name: "Sponsor A",
        cvr_number: "12345678",
        email: "new@example.test",
      }),
    ],
    [current],
  );
  assert.equal(update.kind, "update");
  assert.deepEqual(update.candidates[0].changes, [
    { label: "E-mail", before: current.email, after: "new@example.test" },
  ]);
  assert.equal(
    proposeSponsors([row({ name: current.name })], [current])[0].kind,
    "review",
  );
  assert.equal(
    proposeSponsors(
      [
        row({
          name: current.name,
          cvr_number: "87654321",
          phone: current.phone!,
        }),
      ],
      [current],
    )[0].kind,
    "review",
  );
  assert.ok(
    proposeSponsors(
      [row({ name: "Ny sponsor" }), row({ name: "Ny Sponsor" })],
      [],
    ).every(({ kind }) => kind === "review"),
  );
  assert.equal(
    proposeSponsors([row({ name: "Anden sponsor" })], [current])[0].kind,
    "new",
  );
});

test("database approval writes in one transaction, preserves missing fields and rejects stale versions", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000003'::uuid $$;
      create function public.can_manage_stakeholder_data(uuid) returns boolean language sql as $$ select $1 = '${organization}'::uuid $$;
      create table stakeholders (
        id uuid primary key default gen_random_uuid(), organization_id uuid, name text,
        stakeholder_type text, relationship_status text, cvr_number text, address_line text,
        postal_code text, city text, phone text, email text, notes text,
        internal_owner_user_id uuid, created_by uuid, updated_by uuid, archived_at timestamptz,
        updated_at timestamptz default now()
      );
      create table stakeholder_contacts (organization_id uuid, stakeholder_id uuid, name text,
        email text, phone text, created_by uuid, updated_by uuid, archived_at timestamptz);
    `);
    await db.exec(
      await readFile(
        "supabase/migrations/202611140010_sponsor_import.sql",
        "utf8",
      ),
    );
    await db.query(
      "insert into stakeholders (id,organization_id,name,phone,updated_at) values ($1,$2,$3,$4,$5)",
      [sponsor, organization, current.name, current.phone, current.updated_at],
    );
    const apply = (operations: object[], org = organization) =>
      db.query("select apply_sponsor_import($1,$2)", [
        org,
        JSON.stringify(operations),
      ]);
    const update = {
      id: sponsor,
      version: current.updated_at,
      fields: { name: current.name, email: "new@example.test" },
    };
    const create = { fields: { name: "Ny sponsor" }, contact: "Testperson" };
    await assert.rejects(
      apply([create, { ...update, version: "2025-01-01T00:00:00Z" }]),
      { code: "40001" },
    );
    assert.equal(
      (await db.query("select * from stakeholder_contacts")).rows.length,
      0,
    );
    await assert.rejects(apply([create], sponsor), { code: "42501" });
    await apply([create, update]);
    const { rows } = await db.query(
      "select email,phone from stakeholders where id=$1",
      [sponsor],
    );
    assert.deepEqual(rows, [
      { email: "new@example.test", phone: current.phone },
    ]);
    await assert.rejects(apply([create]), { code: "23505" });
  } finally {
    await db.close();
  }
});

test("a unique strong match prevails over another sponsor at the same address", () => {
  const shared = {
    ...current,
    id: organization,
    name: "Sponsor B",
    cvr_number: null,
    phone: null,
    email: null,
  };
  const input = row({
    name: current.name,
    address_line: current.address_line!,
    postal_code: current.postal_code!,
  });
  const [proposal] = proposeSponsors([input], [shared, current]);
  assert.equal(proposal.kind, "unchanged");
  assert.deepEqual(
    proposal.candidates.map(({ id }) => id),
    [current.id],
  );
  assert.equal(proposeSponsors([input], [shared])[0].kind, "review");
  const competing = { ...shared, cvr_number: current.cvr_number };
  assert.equal(
    proposeSponsors(
      [row({ ...input.fields, cvr_number: current.cvr_number! })],
      [current, competing],
    )[0].kind,
    "review",
  );
});

test("rows with the same name and email make one proposal with both source references", () => {
  const first = row({
    name: "Sponsor A",
    email: "hello@example.test",
    phone: "12345678",
    notes: "Første note",
  });
  const other = {
    ...row({
      name: "Sponsor A",
      email: "HELLO@example.test",
      notes: "Anden note",
    }),
    source: "Anden fane",
    row: 3,
    details: [["Pris", "1000"]] as SponsorRow["details"],
  };
  const proposals = proposeSponsors([first, other], []);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].kind, "new");
  assert.equal(proposals[0].row.fields.phone, "12345678");
  assert.deepEqual(proposals[0].additionalRows, [
    { source: "Anden fane", row: 3 },
  ]);
  assert.ok(
    proposals[0].row.details.some(([, value]) => value === "Anden note"),
  );
  const conflict = { ...other, fields: { ...other.fields, phone: "87654321" } };
  assert.equal(proposeSponsors([first, conflict], [])[0].kind, "review");
});
