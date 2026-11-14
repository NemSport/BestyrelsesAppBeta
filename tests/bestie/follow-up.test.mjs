import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [org, committee, person, outsider, task, event, nextTask, otherEvent] =
  Array.from({ length: 8 }, (_, index) => id(index + 1));

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as
      $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('test.user_id', true), ''))::uuid $$;
    create table profiles(id uuid primary key);
    create table organizations(id uuid primary key, deleted_at timestamptz);
    create table committees(id uuid primary key, organization_id uuid, deleted_at timestamptz, archived_at timestamptz);
    create table meetings(id uuid primary key, organization_id uuid, committee_id uuid, title text, status text default 'completed', deleted_at timestamptz);
    create table meeting_minutes(id uuid primary key, meeting_id uuid, organization_id uuid, committee_id uuid, status text);
    create table meeting_attendees(meeting_id uuid, user_id uuid, attendance_status text);
    create table meeting_minute_approvals(meeting_minutes_id uuid, user_id uuid, status text);
    create table agenda_items(id uuid primary key, title text, deleted_at timestamptz);
    create table agenda_item_occurrences(id uuid primary key, meeting_id uuid, agenda_item_id uuid, deleted_at timestamptz);
    create table meeting_task_links(meeting_id uuid, task_id uuid, occurrence_id uuid);
    create table decisions(id uuid primary key, organization_id uuid, committee_id uuid, meeting_id uuid, agenda_item_id uuid, responsible_user_id uuid, title text, archived_at timestamptz, status text);
    create table organization_members(organization_id uuid, user_id uuid, role text, status text);
    create table committee_members(committee_id uuid, user_id uuid, role text, status text);
    create type task_status as enum ('waiting', 'completed', 'cancelled');
    create table tasks(
      id uuid primary key, organization_id uuid, committee_id uuid, title text,
      responsible_user_id uuid, deadline date, status task_status default 'waiting',
      archived_at timestamptz, completed_at timestamptz, updated_by uuid, updated_at timestamptz default now(),
      annual_wheel_event_id uuid, annual_wheel_activation_year int, meeting_id uuid, agenda_item_id uuid, decision_id uuid
    );
    create table annual_wheel_events(
      id uuid primary key, organization_id uuid, committee_id uuid, title text, responsible_user_id uuid,
      task_id uuid, starts_on date, status text default 'planned', deleted_at timestamptz, updated_by uuid
    );
    create function stamp_task_actor() returns trigger language plpgsql as $$
      begin
        new.updated_by := auth.uid();
        if new.updated_by is null then raise exception 'Missing task author'; end if;
        return new;
      end $$;
    create trigger task_actor before update on tasks for each row
      when (new.updated_by is not null) execute function stamp_task_actor();
    create table task_comments(task_id uuid, organization_id uuid, committee_id uuid, body text, created_by uuid not null);
    create function stamp_comment_actor() returns trigger language plpgsql as $$
      begin new.created_by := auth.uid(); return new; end $$;
    create trigger comment_actor before insert on task_comments for each row execute function stamp_comment_actor();
  `);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611130001_bestie_follow_up.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611130002_bestie_task_audit_actor.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(await readFile(
    new URL("../../supabase/migrations/202611130007_bestie_annual_wheel_tasks.sql", import.meta.url),
    "utf8",
  ));
  await db.exec(await readFile(
    new URL("../../supabase/migrations/202611140005_bestie_after_meeting.sql", import.meta.url),
    "utf8",
  ));
});

after(async () => db.close());

beforeEach(async () => {
  await db.exec(`
    truncate profiles, organizations, committees, tasks, annual_wheel_events cascade;
    truncate organization_members, committee_members, task_comments;
    insert into profiles values ('${person}'), ('${outsider}');
    insert into organizations(id) values ('${org}');
    insert into committees(id, organization_id) values ('${committee}', '${org}');
    insert into organization_members values ('${org}', '${person}', 'member', 'active'), ('${org}', '${outsider}', 'member', 'active');
    insert into committee_members values ('${committee}', '${person}', 'member', 'active');
    insert into annual_wheel_events(id, organization_id, committee_id, title, responsible_user_id, task_id, starts_on)
      values ('${event}', '${org}', '${committee}', 'Generalforsamling', '${person}', '${task}',
        (now() at time zone 'Europe/Copenhagen')::date + 14),
      ('${otherEvent}', '${org}', null, 'Årsberetning', '${person}', null, (now() at time zone 'Europe/Copenhagen')::date + 14);
    insert into tasks(id, organization_id, committee_id, title, responsible_user_id, deadline, annual_wheel_event_id, annual_wheel_activation_year)
      values ('${task}', '${org}', '${committee}', 'Ring til Peter', '${person}',
        (now() at time zone 'Europe/Copenhagen')::date + 3, '${event}',
        extract(year from (now() at time zone 'Europe/Copenhagen')::date + 14)),
      ('${nextTask}', '${org}', '${committee}', 'Senere opgave', '${person}', null, null, null);
  `);
});

async function generate() {
  return (await db.query("select public.bestie_generate_messages() as count"))
    .rows[0].count;
}

async function taskThread() {
  return (
    await db.query("select * from bestie_threads where task_id = $1", [task])
  ).rows[0];
}

async function reply(thread, overrides = {}) {
  const values = {
    actor: person,
    replyId: id(100),
    body: "Jeg har ringet.",
    answer: "Jeg har gemt status.",
    pending: null,
    note: "Jeg har ringet.",
    deadline: null,
    complete: false,
    reminder: null,
    ...overrides,
  };
  const taskVersion = thread.task_id
    ? (
        await db.query("select updated_at from tasks where id = $1", [
          thread.task_id,
        ])
      ).rows[0].updated_at
    : null;
  return (
    await db.query(
      "select (public.bestie_apply_reply($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,null)).*",
      [
        thread.id,
        values.actor,
        thread.updated_at,
        values.taskVersion ?? taskVersion,
        values.replyId,
        values.body,
        values.answer,
        values.pending,
        values.note,
        values.deadline,
        values.complete,
        values.reminder,
      ],
    )
  ).rows[0];
}

test("creates proactive task and annual-wheel threads once and consolidates linked work", async () => {
  assert.equal(await generate(), 2);
  assert.equal(await generate(), 0);
  const row = await taskThread();
  assert.equal(row.event_id, event);
  assert.match(row.messages[0].body, /Ring til Peter/);
  const { rows } = await db.query(
    "select * from bestie_threads where task_id is null",
  );
  assert.match(rows[0].messages[0].body, /Årsberetning/);
});

test("each approaching annual-wheel task alerts its own assignee even without an activity owner", async () => {
  await db.exec(`
    update annual_wheel_events set responsible_user_id = null where id = '${event}';
    update tasks set deadline = (now() at time zone 'Europe/Copenhagen')::date + 7
      where id = '${task}';
    insert into committee_members values ('${committee}', '${outsider}', 'member', 'active');
    update tasks set annual_wheel_event_id = '${event}', responsible_user_id = '${outsider}'
      where id = '${nextTask}';
    insert into bestie_push_subscriptions(endpoint, user_id, keys)
      values ('https://example.com', '${outsider}', '{}');
  `);
  assert.equal(await generate(), 3);
  assert.equal(await generate(), 0);
  const { rows } = await db.query(
    "select task_id,user_id,messages from public.bestie_claim_pushes()",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].task_id, nextTask);
  assert.equal(rows[0].user_id, outsider);
  assert.match(rows[0].messages[0].body, /Generalforsamling.*Senere opgave/);
});

test("a proposed status and follow-up are stored together only when approved", async () => {
  await generate();
  const row = await taskThread();
  const { rows: [dates] } = await db.query(
    "select deadline::text, (deadline + 11)::text as reminder from tasks where id = $1",
    [task],
  );
  const proposal = { statusNote: "Jeg har ringet.", reminder: dates.reminder };
  const pending = await reply(row, { pending: JSON.stringify(proposal), note: null });
  assert.equal((await db.query("select * from task_comments")).rows.length, 0);
  assert.equal(pending.follow_up_on, null);
  await reply(pending, { replyId: id(101), body: "Godkend", note: proposal.statusNote, reminder: dates.reminder });
  assert.equal((await taskThread()).pending_action, null);
  assert.equal((await db.query("select follow_up_on::text from bestie_threads where id = $1", [row.id])).rows[0].follow_up_on, dates.reminder);
  assert.equal((await db.query("select body from task_comments")).rows[0].body, proposal.statusNote);
  assert.equal((await db.query("select deadline::text from tasks where id = $1", [task])).rows[0].deadline, dates.deadline);
});

test("messages and task writes are restricted to the assigned user and current roles", async () => {
  await generate();
  const row = await taskThread();
  await assert.rejects(reply(row, { actor: outsider }), { code: "42501" });
  await db.exec(`set role authenticated; set test.user_id = '${outsider}';`);
  assert.equal(
    (await db.query("select count(*)::int as count from bestie_threads"))
      .rows[0].count,
    0,
  );
  await db.exec(`set test.user_id = '${person}';`);
  assert.equal(
    (await db.query("select count(*)::int as count from bestie_threads"))
      .rows[0].count,
    2,
  );
  await assert.rejects(db.query("update bestie_threads set messages = '[]'"), {
    code: "42501",
  });
  await db.exec("reset role; update committee_members set role = 'viewer';");
  await assert.rejects(reply(row), { code: "42501" });
  await db.exec("update committee_members set status = 'inactive';");
  await assert.rejects(reply(row, { note: null }), { code: "42501" });
});

test("reply, audit trail, updated deadline and follow-up commit together and retries are idempotent", async () => {
  await generate();
  const row = await taskThread();
  const date = (
    await db.query(
      "select ((now() at time zone 'Europe/Copenhagen')::date + 14)::text as day",
    )
  ).rows[0].day;
  const values = { deadline: date, reminder: date };
  await reply(row, values);
  await reply(row, values);
  assert.equal((await taskThread()).messages.length, 3);
  assert.equal(
    (await db.query("select deadline::text from tasks where id = $1", [task]))
      .rows[0].deadline,
    date,
  );
  const comments = (await db.query("select body from task_comments")).rows;
  assert.equal(comments.length, 1);
  assert.match(
    comments[0].body,
    /Jeg har ringet.[\s\S]*Bestie ændrede fristen/,
  );
  await assert.rejects(reply(row, { replyId: id(102) }), { code: "40001" });
  await db.exec(
    `update bestie_threads set follow_up_on = (now() at time zone 'Europe/Copenhagen')::date where task_id = '${task}'`,
  );
  await generate();
  assert.equal((await taskThread()).follow_up_on, null);
  assert.match((await taskThread()).messages.at(-1).body, /følge op/);
  await generate();
  assert.equal((await taskThread()).messages.length, 4);
});

test("completion records history and completes the linked annual-wheel activity", async () => {
  await generate();
  const row = await taskThread();
  await reply(row, { complete: true });
  assert.equal(
    (await db.query("select status from tasks where id = $1", [task])).rows[0]
      .status,
    "completed",
  );
  assert.equal(
    (
      await db.query("select status from annual_wheel_events where id = $1", [
        event,
      ])
    ).rows[0].status,
    "completed",
  );
  assert.match(
    (await db.query("select body from task_comments")).rows[0].body,
    /markerede opgaven som færdig/,
  );
});

test("scheduled follow-ups are cancelled for closed work and push claims do not repeat", async () => {
  await generate();
  await db.exec(`
    insert into bestie_push_subscriptions(endpoint, user_id, keys) values ('https://example.com', '${person}', '{}');
    update bestie_threads set follow_up_on = (now() at time zone 'Europe/Copenhagen')::date
      where task_id = '${task}';
    update tasks set status = 'completed' where id = '${task}';
    update annual_wheel_events set status = 'completed' where id = '${event}';
  `);
  await generate();
  assert.equal((await taskThread()).follow_up_on, null);
  assert.equal((await taskThread()).messages.length, 1);
  assert.equal(
    (await db.query("select id from public.bestie_claim_pushes()")).rows.length,
    1,
  );
  assert.equal(
    (await db.query("select id from public.bestie_claim_pushes()")).rows.length,
    0,
  );
});

test("a stale task version cannot overwrite a newer task edit", async () => {
  await generate();
  const thread = await taskThread();
  const stale = (
    await db.query("select updated_at from tasks where id = $1", [task])
  ).rows[0].updated_at;
  await db.query(
    "update tasks set updated_at = now() + interval '1 minute' where id = $1",
    [task],
  );
  await assert.rejects(reply(thread, { taskVersion: stale }), {
    code: "40001",
  });
  assert.equal((await taskThread()).messages.length, 1);
  assert.equal(
    (await db.query("select count(*)::int as count from task_comments")).rows[0]
      .count,
    0,
  );
});

test("final approval queues personal meeting summaries once and accepts a private reply", async () => {
  const meeting = id(30);
  const minutes = id(31);
  await db.exec(`
    insert into meetings(id, organization_id, committee_id, title) values ('${meeting}', '${org}', '${committee}', 'Novembermøde');
    insert into meeting_minutes values ('${minutes}', '${meeting}', '${org}', '${committee}', 'ready_for_approval');
    update tasks set meeting_id = '${meeting}' where id = '${task}';
    insert into meeting_attendees values ('${meeting}', '${outsider}', 'attended');
    insert into decisions values ('${id(32)}', '${org}', '${committee}', '${meeting}', null, '${person}', 'Fælles indkøb', null, 'waiting');
  `);
  assert.equal((await db.query("select * from bestie_threads where meeting_id = $1", [meeting])).rows.length, 0);
  await db.query("update meeting_minutes set status = 'approved' where id = $1", [minutes]);
  await db.query("update meeting_minutes set status = 'approved' where id = $1", [minutes]);
  const { rows } = await db.query("select * from bestie_threads where meeting_id = $1", [meeting]);
  assert.equal(rows.length, 1);
  const summary = rows[0];
  assert.equal(summary.user_id, person);
  assert.equal(summary.meeting_summary.tasks.length, 1);
  assert.deepEqual(summary.meeting_summary.decisions, ["Fælles indkøb"]);

  const { rows: [{ messages }] } = await db.query(
    "select (bestie_apply_reply($1, $2, $3, null, $4, 'Jeg har taget første skridt.', 'Gemt i samtalen.', null, null, null, false, null, null)).messages",
    [summary.id, person, summary.updated_at, id(33)],
  );
  assert.equal(messages[1].body, "Jeg har taget første skridt.");
  await db.query("update meeting_minutes set status = 'ready_for_approval' where id = $1", [minutes]);
  assert.deepEqual((await db.query("select bestie_target_is_accessible(b) as allowed from bestie_threads b where b.id = $1", [summary.id])).rows, [{ allowed: false }]);
});
