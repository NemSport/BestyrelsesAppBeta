import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  activeFollowUpTasks,
  tasksOutsideAgenda,
  followUpReasons,
  followUpStateSchema,
  type FollowUpTask,
} from "../../src/lib/meeting-task-follow-up";

const db = new PGlite();
const org = randomUUID(),
  committee = randomUUID(),
  user = randomUUID(),
  outsider = randomUUID();
let meeting: string, task: string;
before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
    create function is_committee_member(id uuid) returns boolean language sql as $$ select auth.uid() is not null and id::text=current_setting('test.committee',true) $$;
    create function is_organization_admin(id uuid) returns boolean language sql as $$ select false $$;
    create function can_edit_agenda_item(id uuid) returns boolean language sql as $$ select public.is_committee_member(id) and current_setting('test.actor_role',true) in ('member','manager') $$;
    create function can_manage_committee(id uuid) returns boolean language sql as $$ select public.is_committee_member(id) and current_setting('test.actor_role',true)='manager' $$;
    create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$;
    create type standard_agenda_item_key as enum ('agenda_approval','previous_minutes_approval','any_other_business');
    create table organizations(id uuid primary key);
    create table profiles(id uuid primary key, full_name text);
    create table committees(id uuid primary key, organization_id uuid, archived_at timestamptz);
    create table committee_members(organization_id uuid, committee_id uuid, user_id uuid, status text);
    create table meetings(id uuid primary key default gen_random_uuid(), organization_id uuid, committee_id uuid, title text, description text, status text, starts_at timestamptz, ends_at timestamptz, location text, created_by uuid, deleted_at timestamptz);
    create table agenda_items(id uuid primary key default gen_random_uuid(), organization_id uuid, committee_id uuid, title text, description text default '', item_type text, lifecycle_status text, source text, standard_key standard_agenda_item_key, created_by uuid, deleted_at timestamptz);
    create table agenda_item_occurrences(id uuid primary key default gen_random_uuid(), organization_id uuid, committee_id uuid, meeting_id uuid, agenda_item_id uuid, position integer, deleted_at timestamptz, unique(meeting_id,position), unique(meeting_id,agenda_item_id));
    create table meeting_minutes(meeting_id uuid, status text);
    create table transferred_agenda_items(organization_id uuid, committee_id uuid, source_agenda_item_id uuid, target_agenda_item_id uuid, target_meeting_id uuid, status text);
    create table annual_wheel_events(id uuid primary key, organization_id uuid, status text, updated_by uuid);
    create table meeting_material_dispatches(id uuid primary key default gen_random_uuid(), meeting_id uuid, sent_at timestamptz default now(), delivery_status text);
    create function continue_agenda_items_on_meeting(id uuid) returns integer language sql as $$ select 0 $$;
    insert into organizations values('${org}'); insert into profiles values('${user}','Tester'),('${outsider}','Anden');
    insert into committees values('${committee}','${org}',null);
    insert into committee_members values('${org}','${committee}','${user}','active');
    grant usage on schema public,auth to authenticated;
    grant select,insert,update on all tables in schema public to authenticated;
  `);
  for (const name of [
    "202606140001_task_foundation.sql",
    "202606150001_task_comments.sql",
  ]) {
    await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
  }
  await db.exec(
    `alter table tasks add column annual_wheel_event_id uuid, add column annual_wheel_activation_year integer, add column meeting_id uuid, add column agenda_item_id uuid;`,
  );
  await db.exec(
    await readFile(
      "supabase/migrations/202611100001_task_follow_up_key.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/202611100002_meeting_task_follow_up.sql",
      "utf8",
    ),
  );
  await db.exec(await readFile("supabase/migrations/202611100003_meeting_task_links_api_compatibility.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202611140004_meeting_task_follow_up_unlinked.sql", "utf8"));
});
after(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec(`reset role; set test.user_id='${user}'; set test.committee='${committee}'; set test.actor_role='manager';
    truncate meeting_task_events, meeting_task_links, task_comments, tasks, agenda_item_occurrences, agenda_items, meeting_minutes, meeting_material_dispatches, meetings cascade;`);
  meeting = (
    await db.query<{ id: string }>(
      `insert into meetings(organization_id,committee_id,title,status) values($1,$2,'Test','scheduled') returning id`,
      [org, committee],
    )
  ).rows[0].id;
  task = (
    await db.query<{ id: string }>(
      `insert into tasks(organization_id,committee_id,title,created_by,updated_by,deadline) values($1,$2,'Testopgave',$3,$3,'2026-11-09') returning id`,
      [org, committee, user],
    )
  ).rows[0].id;
  await db.exec("set role authenticated");
});
async function state(id = meeting) {
  return followUpStateSchema.parse(
    (
      await db.query<{ value: unknown }>(
        "select read_meeting_task_follow_up($1) as value",
        [id],
      )
    ).rows[0].value,
  );
}
async function mutate(
  change: Record<string, unknown>,
  opts: {
    id?: string;
    version?: string;
    taskId?: string;
    meetingId?: string;
  } = {},
) {
  const version =
    opts.version ??
    (await state()).tasks.find((t) => t.id === task)!.updated_at;
  await db.query("select mutate_meeting_task_follow_up($1,$2,$3,$4,$5)", [
    opts.meetingId ?? meeting,
    opts.taskId ?? task,
    opts.id ?? randomUUID(),
    version,
    change,
  ]);
}

test("link identity avoids implicit many-to-many API embedding and retains meeting/task uniqueness", async () => {
  const keys = await db.query<{ kind: string; columns: string[] }>(`
    select c.contype as kind, array_agg(a.attname order by k.ordinality) as columns
    from pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(attnum, ordinality)
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
    where c.conrelid='meeting_task_links'::regclass and c.contype in ('p','u')
    group by c.oid, c.contype`);
  assert.deepEqual(keys.rows.find(key => key.kind === 'p')?.columns, ['id']);
  assert.deepEqual(keys.rows.find(key => key.kind === 'u')?.columns, ['meeting_id', 'task_id']);
});

test("attention filters use Copenhagen date, include day 7 and exclude completed/archived", () => {
  const sample: FollowUpTask = {
    id: task,
    title: "Test",
    status: "not_started",
    deadline: "2026-11-17",
    responsible_user_id: null,
    responsible_name: null,
    is_critical: false,
    archived_at: null,
    updated_at: "2026-11-10T00:00:00Z",
    latest_note: null,
  };
  const now = new Date("2026-11-09T23:30:00Z");
  assert.deepEqual(followUpReasons(sample, now), ["Forfalder snart"]);
  assert.deepEqual(
    followUpReasons({ ...sample, deadline: "2026-11-10" }, now),
    ["I dag"],
  );
  assert.deepEqual(
    followUpReasons(
      {
        ...sample,
        deadline: "2026-11-09",
        is_critical: true,
        status: "waiting",
      },
      now,
    ),
    ["Kritisk", "Overskredet", "Afventer"],
  );
  assert.equal(
    activeFollowUpTasks(
      [
        sample,
        { ...sample, id: "closed", status: "completed" },
        { ...sample, id: "archived", archived_at: "x" },
      ],
      false,
      now,
    ).length,
    1,
  );
  assert.deepEqual(
    followUpReasons({ ...sample, deadline: "2026-11-18" }, now),
    [],
  );
});
test("new meetings have exactly four points with follow-up before Eventuelt", async () => {
  const created = await db.query<{ id: string }>(
    "select (create_meeting_with_standard_items($1,$2,'Nyt møde','','2026-12-01')).id",
    [org, committee],
  );
  const id = created.rows[0].id;
  await db.query("select ensure_meeting_task_follow_up($1)", [id]);
  const rows = await db.query<{ standard_key: string }>(
    "select a.standard_key from agenda_item_occurrences o join agenda_items a on a.id=o.agenda_item_id where meeting_id=$1 order by position",
    [id],
  );
  assert.deepEqual(
    rows.rows.map((r) => r.standard_key),
    [
      "agenda_approval",
      "previous_minutes_approval",
      "task_follow_up",
      "any_other_business",
    ],
  );
});
test("upgrades are idempotent, mutations update canonical task and retain immutable before/after and shared note", async () => {
  await db.query("select ensure_meeting_task_follow_up($1)", [meeting]);
  await db.query("select ensure_meeting_task_follow_up($1)", [meeting]);
  assert.equal((await db.query("select * from agenda_items")).rows.length, 1);
  await mutate({
    action: "update",
    status: "completed",
    deadline: "2026-12-01",
    responsibleUserId: user,
    isCritical: true,
    note: "Aftalt på mødet",
  });
  const result = await state();
  assert.equal(result.tasks[0].status, "completed");
  assert.equal(result.tasks[0].latest_note, "Aftalt på mødet");
  assert.equal(result.events[0].before_state?.status, "not_started");
  assert.equal(result.events[0].after_state.status, "completed");
  assert.equal(activeFollowUpTasks(result.tasks, false).length, 0);
  await assert.rejects(
    db.query("update meeting_task_events set note='forged'"),
    /permission denied/,
  );
});
test("stale edits roll back and replayed requests do not duplicate notes or history", async () => {
  const original = (await state()).tasks[0].updated_at;
  const id = randomUUID();
  await mutate(
    { action: "update", note: "Kun en gang" },
    { id, version: original },
  );
  await mutate(
    { action: "update", note: "Kun en gang" },
    { id, version: original },
  );
  await assert.rejects(
    mutate({ action: "update", status: "completed" }, { version: original }),
    /ændret af en anden/,
  );
  assert.equal((await state()).events.length, 1);
  assert.equal((await db.query("select * from task_comments")).rows.length, 1);
});
test("linking is idempotent without moving task origin and reuses durable topic across meetings", async () => {
  await mutate({ action: "link" });
  await mutate({ action: "link" });
  assert.equal((await state()).links.length, 1);
  assert.equal((await db.query("select * from tasks")).rows.length, 1);
  assert.equal(
    (await db.query<{ meeting_id: null }>("select meeting_id from tasks"))
      .rows[0].meeting_id,
    null,
  );
  const next = (
    await db.query<{ id: string }>(
      "insert into meetings(organization_id,committee_id,title,status) values($1,$2,'Næste','scheduled') returning id",
      [org, committee],
    )
  ).rows[0].id;
  await mutate({ action: "link" }, { meetingId: next });
  assert.equal((await db.query("select * from agenda_items")).rows.length, 1);
  assert.equal((await state(next)).links.length, 1);
  assert.equal((await state()).events.length, 1);
});
test("links to an existing occurrence reject cross-meeting occurrence and preserve task", async () => {
  await mutate({ action: "link" });
  const occurrence = (await state()).links[0].occurrence_id;
  const second = (
    await db.query<{ id: string }>(
      "insert into tasks(organization_id,committee_id,title,created_by,updated_by) values($1,$2,'Anden opgave',$3,$3) returning id",
      [org, committee, user],
    )
  ).rows[0].id;
  const version = (await state()).tasks.find(
    (t) => t.id === second,
  )!.updated_at;
  await mutate(
    { action: "link", occurrenceId: occurrence },
    { taskId: second, version },
  );
  assert.equal((await state()).links.length, 2);
  assert.equal((await db.query("select * from agenda_items")).rows.length, 1);
  await assert.rejects(
    mutate(
      { action: "link", occurrenceId: randomUUID() },
      { taskId: randomUUID() },
    ),
    /tilhører ikke/,
  );
});
test("viewer cannot write, member cannot schedule, outsider cannot read history or mutate another committee", async () => {
  await mutate({ action: "update", note: "Historik" });
  await db.exec("set test.actor_role='viewer'");
  await assert.rejects(
    mutate({ action: "update", status: "completed" }),
    /adgang/,
  );
  await db.exec("set test.actor_role='member'");
  await assert.rejects(mutate({ action: "link" }), /ledelse/);
  await mutate({ action: "update", status: "waiting" });
  await db.exec(`set test.committee='${outsider}'`);
  assert.equal(
    (await db.query("select * from meeting_task_events")).rows.length,
    0,
  );
  assert.equal((await db.query("select * from tasks")).rows.length, 0);
  await assert.rejects(state(), /adgang/);
  await assert.rejects(
    mutate({ action: "update" }, { version: "2026-11-10T00:00:00Z" }),
    /adgang/,
  );
});
test("invalid assignees, archived tasks and closed/approved meetings cannot be changed", async () => {
  await assert.rejects(
    mutate({ action: "update", responsibleUserId: outsider }),
    /aktivt/,
  );
  await db.query("insert into meeting_minutes values($1,'approved')", [
    meeting,
  ]);
  assert.equal((await state()).writable, false);
  await assert.rejects(
    mutate({ action: "update", status: "completed" }),
    /godkendt/,
  );
  await assert.rejects(
    db.query("select ensure_meeting_task_follow_up($1)", [meeting]),
    /godkendt/,
  );
});

test("cross-committee task and occurrence IDs cannot bypass the transaction scope", async () => {
  const foreignCommittee = randomUUID();
  const foreignMeeting = randomUUID();
  const foreignTask = randomUUID();
  const foreignOccurrence = randomUUID();
  await db.exec("reset role");
  await db.query("insert into committees values($1,$2,null)", [
    foreignCommittee,
    org,
  ]);
  await db.query(
    "insert into meetings(id,organization_id,committee_id,title,status) values($1,$2,$3,'Andet udvalg','scheduled')",
    [foreignMeeting, org, foreignCommittee],
  );
  await db.query(
    "insert into tasks(id,organization_id,committee_id,title,created_by,updated_by) values($1,$2,$3,'Fremmed opgave',$4,$4)",
    [foreignTask, org, foreignCommittee, user],
  );
  const item = (
    await db.query<{ id: string }>(
      "insert into agenda_items(organization_id,committee_id,title) values($1,$2,'Fremmed punkt') returning id",
      [org, foreignCommittee],
    )
  ).rows[0].id;
  await db.query(
    "insert into agenda_item_occurrences(id,organization_id,committee_id,meeting_id,agenda_item_id,position) values($1,$2,$3,$4,$5,0)",
    [foreignOccurrence, org, foreignCommittee, foreignMeeting, item],
  );
  await db.exec("set role authenticated");
  await assert.rejects(
    mutate({ action: "update", status: "completed" }, { taskId: foreignTask }),
    /tilhører ikke/,
  );
  await assert.rejects(
    mutate({ action: "link", occurrenceId: foreignOccurrence }),
    /tilhører ikke/,
  );
  assert.equal((await state()).events.length, 0);
});

test("anonymous calls, completed meetings and archived tasks reject mutations", async () => {
  const version = (await state()).tasks[0].updated_at;
  await db.exec("set test.user_id=''");
  await assert.rejects(mutate({ action: "update" }, { version }), /adgang/);
  await db.query("select set_config('test.user_id',$1,false)", [user]);
  await db.query("update meetings set status='completed' where id=$1", [
    meeting,
  ]);
  await assert.rejects(mutate({ action: "update" }), /afsluttet/);
  await db.query("update meetings set status='scheduled' where id=$1", [
    meeting,
  ]);
  await db.query("update tasks set archived_at=now() where id=$1", [task]);
  await assert.rejects(mutate({ action: "update" }, { version }), /arkiveret/);
});

test("dispatch snapshot remains fixed after task updates and omits internal notes", async () => {
  const before = (await state()).tasks[0];
  await db.query(
    "insert into meeting_material_dispatches(meeting_id,delivery_status,task_snapshot) values($1,'stubbed',$2)",
    [
      meeting,
      [
        {
          id: before.id,
          title: before.title,
          status: before.status,
          deadline: before.deadline,
          responsible_name: before.responsible_name,
        },
      ],
    ],
  );
  await mutate({
    action: "update",
    status: "completed",
    deadline: "2026-12-01",
  });
  const snapshot = (await state()).snapshots[0];
  assert.equal(snapshot.delivery_status, "stubbed");
  assert.equal(snapshot.task_snapshot[0].status, "not_started");
  assert.equal(snapshot.task_snapshot[0].deadline, "2026-11-09");
  assert.equal(JSON.stringify(snapshot).includes("internal_note"), false);
});

test("both follow-up tabs omit tasks shown under another point on this meeting only", async () => {
  await mutate({ action: "link" });
  const explicit = (await state()).links[0];
  await db.exec("reset role");
  const { rows: [point] } = await db.query<{ agenda_item_id: string }>(
    "select agenda_item_id from agenda_item_occurrences where id=$1", [explicit.occurrence_id],
  );
  const native = (
    await db.query<{ id: string }>(
      "insert into tasks(organization_id,committee_id,title,created_by,updated_by,agenda_item_id,deadline) values($1,$2,'Oprettet på punktet',$3,$3,$4,'2026-11-09') returning id",
      [org, committee, user, point.agenda_item_id],
    )
  ).rows[0].id;
  const otherMeeting = (
    await db.query<{ id: string }>(
      "insert into meetings(organization_id,committee_id,title,status) values($1,$2,'Andet møde','scheduled') returning id",
      [org, committee],
    )
  ).rows[0].id;
  const { rows: [previousPoint] } = await db.query<{ id: string }>(
    "insert into agenda_items(organization_id,committee_id,title) values($1,$2,'Tidligere punkt') returning id",
    [org, committee],
  );
  const { rows: [carried] } = await db.query<{ id: string }>(
    "insert into tasks(organization_id,committee_id,title,created_by,updated_by,agenda_item_id,deadline) values($1,$2,'Overført opgave',$3,$3,$4,'2026-11-09') returning id",
    [org, committee, user, previousPoint.id],
  );
  await db.query(
    "insert into transferred_agenda_items values($1,$2,$3,$4,$5,'scheduled')",
    [org, committee, previousPoint.id, point.agenda_item_id, meeting],
  );
  await db.exec("set role authenticated");
  const view = await state();
  assert.deepEqual(view.links.filter(({ occurrence_id }) => occurrence_id === explicit.occurrence_id).map(({ task_id }) => task_id).sort(), [task, native, carried.id].sort());
  const now = new Date("2026-11-10T10:00:00Z");
  for (const attentionOnly of [true, false]) {
    assert.deepEqual(activeFollowUpTasks(tasksOutsideAgenda(view), attentionOnly, now), []);
    assert.deepEqual(activeFollowUpTasks(tasksOutsideAgenda(await state(otherMeeting)), attentionOnly, now).map(({ id }) => id).sort(), [task, native, carried.id].sort());
  }

  await db.exec("reset role");
  await db.query("update agenda_item_occurrences set deleted_at = now() where id=$1", [explicit.occurrence_id]);
  await db.exec("set role authenticated");
  assert.deepEqual(tasksOutsideAgenda(await state()).map(({ id }) => id).sort(), [task, native, carried.id].sort());
});
