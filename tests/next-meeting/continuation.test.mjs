import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Run the real scheduling/creation functions in PostgreSQL with a small domain
// fixture. Authentication and membership are controlled explicitly by each test.
const db = new PGlite();
const org = "00000000-0000-4000-8000-000000000001";
const committee = "00000000-0000-4000-8000-000000000002";
const user = "00000000-0000-4000-8000-000000000003";
const other = "00000000-0000-4000-8000-000000000004";
let source;
let item;
let occurrence;
let minutes;

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
    create function public.can_manage_committee(id uuid) returns boolean language sql as
      $$ select auth.uid() is not null and id::text = current_setting('test.committee', true) $$;
    create table committees(id uuid primary key, organization_id uuid, archived_at timestamptz);
    create table meetings(
      id uuid primary key default gen_random_uuid(), organization_id uuid, committee_id uuid,
      title text, description text, status text default 'scheduled', starts_at timestamptz,
      ends_at timestamptz, location text, created_by uuid, deleted_at timestamptz,
      created_at timestamptz default now()
    );
    create table agenda_items(
      id uuid primary key default gen_random_uuid(), organization_id uuid, committee_id uuid,
      parent_id uuid, title text, description text default '', objective text default '',
      item_type text, lifecycle_status text, owner_id uuid, source text,
      target_date date, created_by uuid, standard_key text, deleted_at timestamptz
    );
    create table agenda_item_occurrences(
      id uuid primary key default gen_random_uuid(), organization_id uuid, committee_id uuid,
      agenda_item_id uuid, meeting_id uuid, position integer, presenter_id uuid,
      carried_forward boolean default false, deleted_at timestamptz,
      unique(meeting_id, position), unique(meeting_id, agenda_item_id)
    );
    create table agenda_item_minutes(
      id uuid primary key default gen_random_uuid(), agenda_item_id uuid, meeting_id uuid,
      status text, responsible_user_id uuid, deadline date, notes text
    );
    create table transferred_agenda_items(
      id uuid primary key default gen_random_uuid(), organization_id uuid, committee_id uuid,
      source_meeting_id uuid, source_agenda_item_id uuid, source_agenda_item_occurrence_id uuid,
      source_agenda_item_minutes_id uuid, source_status text, target_item_type text,
      status text default 'pending', target_meeting_id uuid, target_agenda_item_id uuid,
      updated_by uuid
    );
  `);
  for (const path of [
    "202608060002_transferred_task_references_hotfix.sql",
    "202611030001_continue_agenda_items_on_next_meeting.sql",
  ]) {
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${path}`, import.meta.url),
        "utf8",
      ),
    );
  }
});

after(async () => db.close());

beforeEach(async () => {
  await db.exec(`truncate committees, meetings, agenda_items, agenda_item_occurrences,
    agenda_item_minutes, transferred_agenda_items;
    set test.user_id = '${user}'; set test.committee = '${committee}';
    insert into committees values ('${committee}', '${org}', null);`);
  source = await meeting("2026-10-01");
  item = (
    await db.query(
      `insert into agenda_items(organization_id, committee_id, title, item_type)
    values ($1, $2, 'Genbrugskopper', 'discussion') returning id`,
      [org, committee],
    )
  ).rows[0].id;
  occurrence = (
    await db.query(
      `insert into agenda_item_occurrences(agenda_item_id, meeting_id, position)
    values ($1, $2, 7) returning id`,
      [item, source],
    )
  ).rows[0].id;
  minutes = (
    await db.query(
      `insert into agenda_item_minutes(agenda_item_id, meeting_id, status, deadline, notes)
    values ($1, $2, 'discussion_continue', '2026-12-01', 'Tidligere referat') returning id`,
      [item, source],
    )
  ).rows[0].id;
});

async function meeting(
  date,
  scope = committee,
  status = "scheduled",
  organization = org,
) {
  return (
    await db.query(
      `insert into meetings(organization_id, committee_id, starts_at, status)
    values ($1, $2, $3, $4) returning id`,
      [organization, scope, date, status],
    )
  ).rows[0].id;
}

async function transfer(
  status = "pending",
  sourceStatus = "discussion_continue",
) {
  return (
    await db.query(
      `insert into transferred_agenda_items(
    organization_id, committee_id, source_meeting_id, source_agenda_item_id,
    source_agenda_item_occurrence_id, source_agenda_item_minutes_id,
    source_status, target_item_type, status)
    values ($1,$2,$3,$4,$5,$6,$7,'discussion',$8) returning id`,
      [org, committee, source, item, occurrence, minutes, sourceStatus, status],
    )
  ).rows[0].id;
}

async function continueOn(target) {
  return (
    await db.query(
      "select public.continue_agenda_items_on_meeting($1) as count",
      [target],
    )
  ).rows[0].count;
}

test("new ordinary meeting imports a waiting continuation atomically with standard items", async () => {
  await transfer();
  const target = (
    await db.query(
      `select (public.create_meeting_with_standard_items(
    $1, $2, 'Næste møde', '', '2026-11-03')).id`,
      [org, committee],
    )
  ).rows[0].id;
  const rows = (
    await db.query(
      `select a.title, a.parent_id, a.target_date, a.description,
    o.carried_forward from agenda_item_occurrences o join agenda_items a on a.id=o.agenda_item_id
    where o.meeting_id=$1 order by o.position`,
      [target],
    )
  ).rows;
  assert.equal(rows.length, 4);
  const continued = rows.find((row) => row.title === "Genbrugskopper");
  assert.equal(continued.parent_id, item);
  assert.equal(continued.carried_forward, true);
  assert.equal(continued.description, "");
  assert.equal(await continueOn(target), 0);
  assert.equal(
    (
      await db.query("select notes from agenda_item_minutes where id=$1", [
        minutes,
      ])
    ).rows[0].notes,
    "Tidligere referat",
  );
});

test("saving continuation after the next meeting exists schedules it immediately", async () => {
  const target = await meeting("2026-11-03");
  await transfer();
  const rows = (await db.query("select * from transferred_agenda_items")).rows;
  assert.equal(rows[0].status, "scheduled");
  assert.equal(rows[0].target_meeting_id, target);
});

test("existing meetings can recover older pending transfers without duplicates", async () => {
  await transfer();
  const target = await meeting("2026-11-03");
  assert.equal(await continueOn(target), 1);
  assert.equal(await continueOn(target), 0);
});

test("only the chronological next meeting in the same organization and committee receives the point", async () => {
  await transfer();
  const foreignCommittee = await meeting("2026-10-10", other);
  const foreignOrg = await meeting("2026-10-12", committee, "scheduled", other);
  const cancelled = await meeting("2026-10-15", committee, "cancelled");
  const deleted = await meeting("2026-10-20");
  await db.query("update meetings set deleted_at=now() where id=$1", [deleted]);
  const target = await meeting("2026-11-03");
  const later = await meeting("2026-12-01");
  await assert.rejects(continueOn(foreignCommittee), /ledelse/);
  assert.equal(await continueOn(foreignOrg), 0);
  assert.equal(await continueOn(cancelled), 0);
  assert.equal(await continueOn(later), 0);
  assert.equal(await continueOn(target), 1);
});

test("dismissed, changed, deleted-source and manual-rule transfers are not imported", async () => {
  await transfer("dismissed");
  await transfer("pending", "needs_decision");
  await transfer();
  const target = await meeting("2026-11-03");
  await db.query(
    "update agenda_item_minutes set status='discussion_completed' where id=$1",
    [minutes],
  );
  assert.equal(await continueOn(target), 0);
  await db.query(
    "update agenda_item_minutes set status='discussion_continue' where id=$1",
    [minutes],
  );
  await db.query(
    "update agenda_item_occurrences set deleted_at=now() where id=$1",
    [occurrence],
  );
  assert.equal(await continueOn(target), 0);
});

test("completed meetings and unauthenticated or unauthorized requests cannot import points", async () => {
  await transfer();
  const target = await meeting("2026-11-03", committee, "completed");
  assert.equal(await continueOn(target), 0);
  await db.exec("set test.user_id = ''");
  await assert.rejects(continueOn(target), /ledelse/);
  await db.exec(
    `set test.user_id = '${user}'; set test.committee = '${other}'`,
  );
  await assert.rejects(continueOn(target), /ledelse/);
});
