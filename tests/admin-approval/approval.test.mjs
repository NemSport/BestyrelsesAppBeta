import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, beforeEach, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select current_setting('test.user')::uuid $$;
    create table profiles(id uuid primary key, full_name text, email text);
    create table organization_members(organization_id uuid, user_id uuid, status text, role text);
    create function public.is_organization_admin(org uuid) returns boolean language sql as $$
      select exists(select 1 from public.organization_members where organization_id=org and user_id=auth.uid() and status='active' and role in ('owner','admin')) $$;
    create table meetings(id uuid primary key, organization_id uuid, committee_id uuid, deleted_at timestamptz);
    create table meeting_minutes(id uuid primary key, organization_id uuid, committee_id uuid, meeting_id uuid, status text, updated_by uuid);
    create table meeting_minute_approvals(id uuid primary key, organization_id uuid, committee_id uuid, meeting_id uuid, meeting_minutes_id uuid, user_id uuid, status text, comment text, responded_at timestamptz, updated_by uuid);
  `);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611050001_admin_minutes_approval.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
beforeEach(async () => {
  await db.exec(`truncate profiles,organization_members,meetings,meeting_minutes,meeting_minute_approvals;
 insert into profiles values ('${id(1)}','Admin Anne','anne@example.test'),('${id(2)}','Deltager','d@example.test');
 insert into organization_members values ('${id(10)}','${id(1)}','active','admin'),('${id(10)}','${id(2)}','active','member');
 insert into meetings values ('${id(20)}','${id(10)}','${id(11)}',null);
 insert into meeting_minutes values ('${id(30)}','${id(10)}','${id(11)}','${id(20)}','ready_for_approval','${id(1)}');
 insert into meeting_minute_approvals values ('${id(40)}','${id(10)}','${id(11)}','${id(20)}','${id(30)}','${id(2)}','pending',null,null,'${id(1)}');
 select set_config('test.user','${id(1)}',false);`);
});
after(() => db.close());
const approve = (user = id(2)) =>
  db.query("select * from approve_meeting_minutes_on_behalf($1,$2)", [
    id(30),
    user,
  ]);
test("admin approval records actor, name and timestamp and finalizes the last response", async () => {
  const {
    rows: [row],
  } = await approve();
  assert.equal(row.status, "approved");
  assert.equal(row.user_id, id(2));
  assert.equal(row.updated_by, id(1));
  assert.match(row.comment, /Admin Anne/);
  assert.ok(row.responded_at);
  assert.equal(
    (await db.query("select status from meeting_minutes")).rows[0].status,
    "approved",
  );
});
test("member and admin from another organization cannot approve", async () => {
  await db.exec(`select set_config('test.user','${id(2)}',false);`);
  await assert.rejects(approve(), /administratorer/);
  await db.exec(
    `update organization_members set role='admin',organization_id='${id(99)}' where user_id='${id(2)}';`,
  );
  await assert.rejects(approve(), /administratorer/);
});
test("nonrecipient, draft and deleted meeting are rejected", async () => {
  await assert.rejects(approve(id(99)), /modtager/);
  await db.exec("update meeting_minutes set status='draft'");
  await assert.rejects(approve(), /ikke sendt/);
  await db.exec(
    "update meeting_minutes set status='ready_for_approval';update meetings set deleted_at=now()",
  );
  await assert.rejects(approve(), /findes ikke/);
});
test("pending peers prevent completion and existing comments survive", async () => {
  await db.exec(
    `update meeting_minute_approvals set status='change_requested',comment='Ret beløbet'; insert into meeting_minute_approvals values ('${id(41)}','${id(10)}','${id(11)}','${id(20)}','${id(30)}','${id(3)}','pending',null,null,'${id(1)}');`,
  );
  const {
    rows: [row],
  } = await approve();
  assert.match(row.comment, /Ret beløbet/);
  assert.equal(
    (await db.query("select status from meeting_minutes")).rows[0].status,
    "ready_for_approval",
  );
});
test("retries preserve the original approval and attribution", async () => {
  const first = (await approve()).rows[0];
  await db.exec("update profiles set full_name='Changed'");
  const second = (await approve()).rows[0];
  assert.deepEqual(second, first);
});
