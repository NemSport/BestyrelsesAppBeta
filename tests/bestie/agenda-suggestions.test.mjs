import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
let organization, committee, next, later, task, decision;

async function insert(sql, params = []) {
  return (await db.query(`${sql} returning id`, params)).rows[0].id;
}

async function approve(meeting, kind, source, title) {
  return (
    await db.query(
      "select approve_bestie_agenda_suggestion($1, $2, $3, $4, $5, $6, '', 'Drøft næste skridt') as approved",
      [meeting, organization, committee, kind, source, title],
    )
  ).rows[0].approved;
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select gen_random_uuid() $$;
    create function public.can_manage_committee(uuid) returns boolean language sql as
      $$ select $1::text = current_setting('test.committee', true) $$;
    create function public.can_edit_agenda_item(uuid) returns boolean language sql as
      $$ select public.can_manage_committee($1) $$;
    create type agenda_item_type as enum ('follow_up');
    create type agenda_item_status as enum ('scheduled');
    create type agenda_item_source as enum ('manual', 'meeting');
    create table organizations(id uuid primary key default gen_random_uuid(), deleted_at timestamptz);
    create table committees(id uuid primary key default gen_random_uuid(), organization_id uuid, deleted_at timestamptz, archived_at timestamptz);
    create table meetings(
      id uuid primary key default gen_random_uuid(), organization_id uuid, committee_id uuid,
      starts_at timestamptz, status text default 'scheduled', deleted_at timestamptz
    );
    create table meeting_minutes(meeting_id uuid, status text);
    create table agenda_items(
      id uuid primary key default gen_random_uuid(), organization_id uuid, committee_id uuid,
      title text, description text, objective text, item_type agenda_item_type, lifecycle_status agenda_item_status,
      target_date date, source agenda_item_source, created_by uuid, deleted_at timestamptz
    );
    create table agenda_item_occurrences(
      meeting_id uuid, organization_id uuid, committee_id uuid, agenda_item_id uuid,
      position integer, deleted_at timestamptz, unique (meeting_id, position)
    );
    create table tasks(
      id uuid primary key default gen_random_uuid(), organization_id uuid, committee_id uuid,
      title text default 'Testkilde', agenda_item_id uuid, archived_at timestamptz, status text default 'waiting'
    );
    create table decisions(like tasks including all);
  `);
  const readMigration = (name) =>
    readFile(
      new URL(`../../supabase/migrations/${name}`, import.meta.url),
      "utf8",
    );
  const agendaFunctions = await readMigration(
    "202606270008_fix_agenda_position_trigger_and_rpc.sql",
  );
  await db.exec(
    agendaFunctions.slice(
      agendaFunctions.indexOf(
        "create or replace function public.create_agenda_item(",
      ),
      agendaFunctions.indexOf(
        "create or replace function public.schedule_agenda_item(",
      ),
    ),
  );
  await db.exec(
    await readMigration("202611130008_bestie_agenda_suggestions.sql"),
  );

  await db.exec(
    await readMigration("202611140001_persist_bestie_agenda_drafts.sql"),
  );

  await db.exec(
    await readMigration("202611140002_review_bestie_agenda_drafts.sql"),
  );

  organization = await insert("insert into organizations default values");
  committee = await insert(
    "insert into committees (organization_id) values ($1)",
    [organization],
  );
  await db.query("select set_config('test.committee', $1, false)", [committee]);
  next = await insert(
    "insert into meetings (organization_id, committee_id, starts_at) values ($1, $2, now() + interval '1 day')",
    [organization, committee],
  );
  later = await insert(
    "insert into meetings (organization_id, committee_id, starts_at) values ($1, $2, now() + interval '2 days')",
    [organization, committee],
  );
  task = await insert(
    "insert into tasks (organization_id, committee_id) values ($1, $2)",
    [organization, committee],
  );
  decision = await insert(
    "insert into decisions (organization_id, committee_id) values ($1, $2)",
    [organization, committee],
  );
});

after(async () => db.close());

test("approval is scoped to the next meeting and rejects closed, foreign, or unauthorized sources", async () => {
  const closed = await insert(
    "insert into tasks (organization_id, committee_id, status) values ($1, $2, 'completed')",
    [organization, committee],
  );
  const foreign = await insert(
    "insert into decisions (organization_id, committee_id) values (gen_random_uuid(), $1)",
    [committee],
  );
  assert.equal(await approve(later, "task", task, "Opfølgning"), false);
  assert.equal(await approve(next, "task", closed, "Opfølgning"), false);
  assert.equal(await approve(next, "decision", foreign, "Opfølgning"), false);

  await db.query("select set_config('test.committee', '', false)");
  try {
    await assert.rejects(approve(next, "task", task, "Opfølgning"), {
      code: "42501",
    });
  } finally {
    await db.query("select set_config('test.committee', $1, false)", [
      committee,
    ]);
  }
});

test("approval appends one agenda item per source and skips duplicate titles", async () => {
  assert.equal(await approve(next, "task", task, "Kontakt leverandøren"), true);
  assert.equal(
    await approve(next, "task", task, "Leverandøropfølgning"),
    false,
  );
  assert.equal(
    await approve(next, "decision", decision, "  kontakt leverandøren "),
    false,
  );
  assert.equal(
    await approve(next, "decision", decision, "Gennemgå beslutningen"),
    true,
  );
  const { rows } = await db.query(`
    select a.title, s.source_kind, o.position
    from agenda_item_occurrences o
    join agenda_items a on a.id = o.agenda_item_id
    join bestie_agenda_sources s on s.agenda_item_id = a.id and s.meeting_id = o.meeting_id
    order by o.position
  `);
  assert.deepEqual(rows, [
    { title: "Kontakt leverandøren", source_kind: "task", position: 1 },
    { title: "Gennemgå beslutningen", source_kind: "decision", position: 2 },
  ]);
});

test("saving and approving drafts preserves the other suggestions on the meeting", async () => {
  const first = await insert(
    "insert into tasks (organization_id, committee_id, title) values ($1, $2, 'Bestil skilte')",
    [organization, committee],
  );
  const second = await insert(
    "insert into decisions (organization_id, committee_id, title) values ($1, $2, 'Fordel nøgler')",
    [organization, committee],
  );
  const drafts = [
    {
      source_kind: "task",
      source_id: first,
      title: "Vælg skilte",
      description: "",
      objective: "Vælg materiale",
    },
    {
      source_kind: "decision",
      source_id: second,
      title: "Fordel nøgler",
      description: "",
      objective: "Aftal ansvar",
    },
  ];
  async function save(meeting, suggestions) {
    return (
      await db.query("select save_bestie_agenda_drafts($1, $2) as saved", [
        meeting,
        JSON.stringify(suggestions),
      ])
    ).rows[0].saved;
  }
  async function approveDraft() {
    return (
      await db.query(
        "select approve_bestie_agenda_draft($1, $2, $3, 'task', $4, '', '<p>Vælg materiale</p>') as approved",
        [next, organization, committee, first],
      )
    ).rows[0].approved;
  }
  assert.equal(await save(later, drafts), 0);
  assert.equal(await save(next, drafts), 2);
  assert.equal(await save(next, [{ ...drafts[0], title: "Ny titel" }]), 0);
  assert.equal(await approveDraft(), true);
  assert.equal(await approveDraft(), false);
  assert.equal(await save(next, drafts), 0);

  const { rows } = await db.query(
    "select source_kind, source_title, title, objective from bestie_agenda_drafts where meeting_id = $1",
    [next],
  );
  assert.deepEqual(rows, [
    {
      source_kind: "decision",
      source_title: "Fordel nøgler",
      title: "Fordel nøgler",
      objective: "Aftal ansvar",
    },
  ]);
  const agenda = await db.query(
    "select title from agenda_items join bestie_agenda_sources on agenda_items.id = bestie_agenda_sources.agenda_item_id where source_id = $1",
    [first],
  );
  assert.deepEqual(agenda.rows, [{ title: "Vælg skilte" }]);
});

test("review approves the edited text and remembers a dismissal only for its meeting", async () => {
  const editSource = await insert(
    "insert into tasks (organization_id, committee_id) values ($1, $2)",
    [organization, committee],
  );
  const dismissSource = await insert(
    "insert into decisions (organization_id, committee_id) values ($1, $2)",
    [organization, committee],
  );
  const suggestions = [
    {
      source_kind: "task",
      source_id: editSource,
      title: "Original titel",
      description: "",
      objective: "Originalt formål",
    },
    {
      source_kind: "decision",
      source_id: dismissSource,
      title: "Afvis dette punkt",
      description: "",
      objective: "Drøft næste skridt",
    },
  ];
  async function save(meeting, drafts) {
    return (
      await db.query("select save_bestie_agenda_drafts($1, $2) as saved", [
        meeting,
        JSON.stringify(drafts),
      ])
    ).rows[0].saved;
  }
  async function review(kind, source, dismiss) {
    return (
      await db.query(
        "select review_bestie_agenda_draft($1, $2, $3, $4, $5, $6, 'Rettet titel', '<p>Rettet baggrund</p>', '<p>Rettet formål</p>') as reviewed",
        [next, organization, committee, kind, source, dismiss],
      )
    ).rows[0].reviewed;
  }

  assert.equal(await save(next, suggestions), 2);
  assert.equal(await review("task", editSource, false), true);
  assert.equal(await review("decision", dismissSource, true), true);
  assert.equal(await review("decision", dismissSource, false), false);
  assert.equal(
    await save(next, [{ ...suggestions[1], title: "Forsøg med ny titel" }]),
    0,
  );

  const edited = await db.query(
    "select title, description, objective from agenda_items join bestie_agenda_sources on agenda_items.id = bestie_agenda_sources.agenda_item_id where source_id = $1",
    [editSource],
  );
  assert.deepEqual(edited.rows, [
    {
      title: "Rettet titel",
      description: "<p>Rettet baggrund</p>",
      objective: "<p>Rettet formål</p>",
    },
  ]);
  const dismissed = await db.query(
    "select dismissed_at is not null as dismissed from bestie_agenda_drafts where meeting_id = $1 and source_id = $2",
    [next, dismissSource],
  );
  assert.deepEqual(dismissed.rows, [{ dismissed: true }]);
  const agenda = await db.query(
    "select 1 from bestie_agenda_sources where source_id = $1",
    [dismissSource],
  );
  assert.equal(agenda.rows.length, 0);

  await db.query("update meetings set status = 'cancelled' where id = $1", [
    next,
  ]);
  assert.equal(await save(later, [suggestions[1]]), 1);
});
