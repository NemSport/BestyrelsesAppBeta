import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { zodTextFormat } from "openai/helpers/zod";
import {
  approveSponsorContract,
  extractedSponsorContract,
  sponsorContractFields,
  validateContractApproval,
} from "../../src/lib/sponsor-contract-import";

const organization = "00000000-0000-4000-8000-000000000001";
const sponsor = "00000000-0000-4000-8000-000000000002";
const actor = "00000000-0000-4000-8000-000000000003";
const fileHash = "a".repeat(64);
const fields = {
  ...Object.fromEntries(
    Object.keys(sponsorContractFields).map((key) => [key, ""]),
  ),
  name: "Sponsor A",
  cvr: "12345678",
  city: "Vorbasse",
  email: "aftaler@example.test",
  contact: "Anne Eksempel",
  title: "Sponsoraftale 2027",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  total: "12500,50",
  currency: "dkk",
};
const input = {
  analysisId: actor,
  sponsorId: sponsor,
  fields,
  autoRenew: false,
  deliverables: ["Logo på trøjen", "Skilt på stadion"],
};
const approval = (value: typeof input) =>
  validateContractApproval(organization, approveSponsorContract.parse(value));

test("extraction schema preserves unknown fields and their source references", () => {
  const schema = zodTextFormat(extractedSponsorContract, "sponsor_contract");
  assert.equal(schema.strict, true);
  const output = extractedSponsorContract.parse({
    fields: Object.fromEntries(
      Object.keys(fields).map((key) => [
        key,
        key === "name"
          ? { value: fields.name, page: 1 }
          : { value: null, page: null },
      ]),
    ),
    autoRenew: null,
    deliverables: [{ title: input.deliverables[0], page: 2 }],
  });
  assert.deepEqual(output.fields.name, { value: fields.name, page: 1 });
  assert.equal(output.fields.cvr.value, null);
});

test("approval validates dates and money and preserves missing optional values", () => {
  const { contract } = approval(input);
  assert.equal(contract.contractValue, 12500.5);
  assert.equal(contract.annualValue, null);
  assert.equal(contract.currency, "DKK");
  assert.throws(() =>
    approval({ ...input, fields: { ...fields, startDate: "" } }),
  );
  assert.throws(() =>
    approval({ ...input, fields: { ...fields, total: "1000000000000" } }),
  );
});

test("approval saves a linked draft and rolls back duplicate and conflicting imports", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '${actor}'::uuid $$;
      create function public.can_manage_stakeholder_data(uuid) returns boolean language sql as $$ select $1 = '${organization}'::uuid $$;
      create table ai_activity_log (
        field text, meeting_id uuid, agenda_item_id uuid, user_id uuid, organization_id uuid
      );
      create table organizations (id uuid primary key, deleted_at timestamptz);
      create table stakeholders (
        id uuid primary key default gen_random_uuid(), organization_id uuid, name text,
        stakeholder_type text, relationship_status text, cvr_number text, address_line text,
        postal_code text, city text, phone text, email text, created_by uuid, updated_by uuid, archived_at timestamptz
      );
      create table stakeholder_contacts (organization_id uuid, stakeholder_id uuid, name text,
        email text, phone text, created_by uuid, updated_by uuid, archived_at timestamptz);
      create table stakeholder_contracts (id uuid primary key default gen_random_uuid(),
        organization_id uuid, stakeholder_id uuid references stakeholders(id), title text,
        status text, contract_value numeric(14,2), annual_value numeric(14,2), currency text,
        start_date date, end_date date, notice_deadline date, renewal_deadline date, auto_renew boolean,
        created_by uuid, updated_by uuid);
      create table stakeholder_contract_deliverables (organization_id uuid, contract_id uuid references stakeholder_contracts(id),
        deliverable_type text, title text, created_by uuid, updated_by uuid);
      insert into organizations values ('${organization}', null);
      insert into stakeholders (id,organization_id,name,email) values
        ('${sponsor}','${organization}','Sponsor A','behold@example.test');
    `);
    await db.exec(
      await readFile(
        "supabase/migrations/202611140011_sponsor_contract_import.sql",
        "utf8",
      ),
    );
    const save = (changes: object = {}, org = organization) =>
      db.query("select approve_sponsor_contract_import($1,$2) as sponsor_id", [
        org,
        JSON.stringify({ ...approval(input), fileHash, ...changes }),
      ]);
    assert.deepEqual((await save()).rows, [{ sponsor_id: sponsor }]);
    assert.deepEqual(
      (await db.query("select email,city,cvr_number from stakeholders")).rows,
      [
        {
          email: "behold@example.test",
          city: "Vorbasse",
          cvr_number: "12345678",
        },
      ],
    );
    assert.deepEqual(
      (
        await db.query(
          "select stakeholder_id,status,contract_value,annual_value from stakeholder_contracts",
        )
      ).rows,
      [
        {
          stakeholder_id: sponsor,
          status: "draft",
          contract_value: "12500.50",
          annual_value: null,
        },
      ],
    );
    assert.equal(
      (await db.query("select * from stakeholder_contract_deliverables")).rows
        .length,
      2,
    );
    assert.equal(
      (await db.query("select * from stakeholder_contacts")).rows.length,
      1,
    );
    const newSponsor = {
      ...approval(input).sponsor,
      name: "Sponsor B",
      cvr: "87654321",
    };
    await assert.rejects(save({ sponsorId: null, sponsor: newSponsor }), {
      code: "23505",
    });
    assert.equal((await db.query("select * from stakeholders")).rows.length, 1);
    await assert.rejects(
      save({ sponsor: { ...newSponsor, contact: "Anden kontakt" } }),
      { code: "40001" },
    );
    await assert.rejects(save({}, sponsor), { code: "42501" });
    await save({
      sponsorId: null,
      sponsor: newSponsor,
      fileHash: "b".repeat(64),
    });
    assert.equal((await db.query("select * from stakeholders")).rows.length, 2);
  } finally {
    await db.close();
  }
});
