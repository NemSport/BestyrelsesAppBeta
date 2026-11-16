import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { zodTextFormat } from "openai/helpers/zod";
import { extractMeetingDocx } from "../../src/lib/meeting-import-docx";
import {
  addCheckedMeetingFollowUps,
  extractedMeetingFollowUps,
  extractedMeetingImport,
  meetingImportApproval,
  suggestMeetingImportAssignee,
} from "../../src/lib/meeting-import";

test("Word body retains separate paragraphs, line breaks and Danish characters", async () => {
  const docx = Buffer.from(
    "UEsDBBQAAAAIAAEAcF3rXAr8pQAAAAMBAAARAAAAd29yZC9kb2N1bWVudC54bWxtj00KwjAQha8SKnTpFBddpLU7l4JXSJvpD+SPSST1Zt33YjZSEcXN9xjevOFNHbm03V2jCWzWyngez9kYguMAvhtRC3+0Ds3m9Za0CNtIA0RL0pHt0PvJDFrBqShK0GIyWVNH3lr5SOoSKCE013WRyHKhXcUIeyQRakhGIr3ofjM3JQzLD/OlrIwk9F+BHS3BvowBifXrooZNrftzHd7V4PN28wRQSwECFAMUAAAACAABAHBd61wK/KUAAAADAQAAEQAAAAAAAAAAAAAAgAEAAAAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAEAAQA/AAAA1AAAAAAA",
    "base64",
  );
  assert.equal(
    await extractMeetingDocx(docx),
    "Møde & referat\nPlan ændres\nPeter følger op",
  );
  await assert.rejects(extractMeetingDocx(Buffer.from("not a Word file")));
});

const org = "00000000-0000-4000-8000-000000000001";
const committee = "00000000-0000-4000-8000-000000000002";
const user = "00000000-0000-4000-8000-000000000003";
const audit = "00000000-0000-4000-8000-000000000004";
const duplicate = "00000000-0000-4000-8000-000000000005";
const proposal = {
  analysisId: audit,
  title: "Testmøde",
  date: "2025-10-01",
  time: "",
  summary: "Kort referat <uden HTML>\nNæste afsnit",
  location: "",
  items: [
    {
      title: "Fælles aktivitet",
      notes:
        "## Udvalg\n- Forslaget blev drøftet.\n- Brug <materiale>.\n\n## Projekter\nNæste skridt afklares.",
      decisions: [
        { title: "Gennemfør aktiviteten", details: "", completed: false },
      ],
      tasks: [
        {
          title: "Find en dato",
          details: "",
          deadline: "",
          namedOwner: "Peter",
          responsibleUserId: "",
          completed: false,
        },
      ],
    },
  ],
};

test("AI can mark illegible notes and missing dates without creating actionable data", () => {
  const source = { file: 1, page: null };
  assert.ok(zodTextFormat(extractedMeetingImport, "meeting").strict);
  const preview = extractedMeetingImport.parse({
    ...proposal,
    date: null,
    time: null,
    items: [],
    questions: [{ text: "Datoen kan ikke læses.", source }],
    participantAliases: [],
  });
  assert.deepEqual(preview.questions[0].source, source);
  assert.throws(() =>
    meetingImportApproval.parse({ ...proposal, date: preview.date }),
  );
  assert.throws(() =>
    meetingImportApproval.parse({
      ...proposal,
      items: [
        {
          ...proposal.items[0],
          tasks: [{ ...proposal.items[0].tasks[0], deadline: "2026-02-30" }],
        },
      ],
    }),
  );
});

test("source initialisms suggest a unique committee member without guessing", () => {
  const alias = {
    initials: "MHE",
    name: "Mette-Helen Eksempel",
    source: { file: 1, page: 1 },
  };
  const member = { id: user, name: "Mette Helen Eksempel" };
  assert.equal(suggestMeetingImportAssignee("MHE", [alias], [member]), user);
  assert.equal(suggestMeetingImportAssignee("MHE", [], [member]), "");
  assert.equal(suggestMeetingImportAssignee("MHE", [alias], []), "");
  assert.equal(
    suggestMeetingImportAssignee(
      "MHE",
      [alias],
      [member, { ...member, id: org }],
    ),
    "",
  );
  assert.equal(
    suggestMeetingImportAssignee(
      "MHE",
      [alias, { ...alias, name: "Mads Henrik Eksempel" }],
      [member],
    ),
    "",
  );
});

test("a dedicated follow-up check fills omitted tasks on the same agenda point", () => {
  const source = { file: 1, page: 2 };
  const notes = "## Projekter\n- AE undersøger lejeprisen.";
  const task = {
    title: "Undersøg lejeprisen",
    details: "Kontakt leverandøren",
    namedOwner: "AE",
    deadline: null,
    completed: false,
  };
  const preview = extractedMeetingImport.parse({
    ...proposal,
    participantAliases: [],
    questions: [],
    items: [
      {
        title: "Siden sidst - Nyt fra udvalgene",
        source,
        notes,
        tasks: [],
        decisions: [],
      },
    ],
  });
  const check = extractedMeetingFollowUps.parse({
    groups: [
      {
        agendaTitle: "3) Siden sidst – Nyt fra udvalgene (O / D)",
        source,
        tasks: [task],
      },
      {
        agendaTitle: "Ukendt punkt",
        source,
        tasks: [{ ...task, title: "Undersøg andet" }],
      },
    ],
  });
  const merged = addCheckedMeetingFollowUps(preview, check);
  assert.equal(merged.items[0].notes, notes);
  assert.deepEqual(merged.items[0].tasks, [task]);
  assert.match(merged.questions[0].text, /Undersøg andet/);
  assert.equal(addCheckedMeetingFollowUps(preview, null).questions.length, 1);
});

test("confirmed import links all records, keeps minutes as draft and prevents duplicate saves", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '${user}'::uuid $$;
      create function public.can_manage_committee(uuid) returns boolean language sql as $$ select $1 = '${committee}'::uuid $$;
      create type public.decision_status as enum ('completed','not_started');
      create type public.task_status as enum ('completed','not_started');
      create table public.organizations(id uuid, deleted_at timestamptz);
      create table public.committees(id uuid, organization_id uuid, deleted_at timestamptz, archived_at timestamptz);
      create table public.ai_activity_log(id uuid, organization_id uuid, user_id uuid, field text, metadata jsonb, status text, meeting_id uuid, agenda_item_id uuid);
      create table public.meetings(id uuid primary key default gen_random_uuid(), organization_id uuid, committee_id uuid, title text, starts_at timestamptz, location text, status text, created_by uuid, deleted_at timestamptz);
      create table public.meeting_minutes(organization_id uuid, committee_id uuid, meeting_id uuid references meetings(id), minutes_text text, status text, created_by uuid, updated_by uuid);
      create table public.agenda_items(id uuid primary key default gen_random_uuid(), organization_id uuid, committee_id uuid, title text, lifecycle_status text, resolved_at timestamptz, created_by uuid);
      create table public.agenda_item_occurrences(id uuid primary key default gen_random_uuid(), organization_id uuid, committee_id uuid, meeting_id uuid references meetings(id), agenda_item_id uuid references agenda_items(id), position int, meeting_status text);
      create table public.agenda_item_minutes(organization_id uuid, committee_id uuid, meeting_id uuid references meetings(id), agenda_item_id uuid references agenda_items(id), agenda_item_occurrence_id uuid references agenda_item_occurrences(id), notes text, created_by uuid, updated_by uuid);
      create table public.decisions(organization_id uuid, committee_id uuid, meeting_id uuid references meetings(id), agenda_item_id uuid references agenda_items(id), title text, description text, decision_date date, status decision_status, created_by uuid, updated_by uuid);
      create table public.tasks(organization_id uuid, committee_id uuid, meeting_id uuid references meetings(id), agenda_item_id uuid references agenda_items(id), title text, description text, deadline date, responsible_user_id uuid, status task_status, created_by uuid, updated_by uuid);
      insert into organizations values ('${org}',null);
      insert into committees values ('${committee}','${org}',null,null);
    `);
    for (const id of [audit, duplicate]) {
      await db.query(
        "insert into ai_activity_log (id,organization_id,user_id,field,metadata,status) values ($1,$2,$3,'historical_meeting_import',$4,'generated')",
        [
          id,
          org,
          user,
          { committeeId: committee, phase: "generated", hash: "b".repeat(64) },
        ],
      );
    }
    await db.exec(
      await readFile(
        "supabase/migrations/202611150003_historical_meeting_import.sql",
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        "supabase/migrations/202611160001_format_imported_point_minutes.sql",
        "utf8",
      ),
    );
    const save = (input = proposal, targetCommittee = committee) =>
      db.query<{ id: string }>(
        "select save_historical_meeting_import($1,$2,$3,$4) as id",
        [org, targetCommittee, input.analysisId, input],
      );
    await assert.rejects(save(proposal, user), { code: "42501" });
    await assert.rejects(save({ ...proposal, date: "2099-10-01" }), {
      code: "22007",
    });
    await assert.rejects(
      save({
        ...proposal,
        items: [
          {
            ...proposal.items[0],
            tasks: Array(9).fill(proposal.items[0].tasks[0]),
          },
        ],
      }),
      { code: "22023" },
    );
    assert.equal((await db.query("select * from meetings")).rows.length, 0);
    const id = (await save()).rows[0].id;
    assert.equal((await save()).rows[0].id, id);
    await assert.rejects(save({ ...proposal, analysisId: duplicate }), {
      code: "23505",
    });
    const { rows } = await db.query(
      `
      select m.status, mm.status as minutes_status, mm.minutes_text, im.notes,
        a.lifecycle_status, d.title as decision, t.title as task, t.responsible_user_id, t.description
      from meetings m
      join meeting_minutes mm on mm.meeting_id=m.id
      join agenda_item_occurrences o on o.meeting_id=m.id
      join agenda_items a on a.id=o.agenda_item_id
      join agenda_item_minutes im on im.agenda_item_occurrence_id=o.id
      join decisions d on d.agenda_item_id=a.id and d.meeting_id=m.id
      join tasks t on t.agenda_item_id=a.id and t.meeting_id=m.id
      where m.id=$1`,
      [id],
    );
    assert.deepEqual(rows, [
      {
        status: "completed",
        minutes_status: "draft",
        minutes_text: "<p>Kort referat &lt;uden HTML&gt;<br>Næste afsnit</p>",
        notes:
          "<h2>Udvalg</h2><ul><li>Forslaget blev drøftet.</li><li>Brug &lt;materiale&gt;.</li></ul><h2>Projekter</h2><p>Næste skridt afklares.</p>",
        lifecycle_status: "resolved",
        decision: "Gennemfør aktiviteten",
        task: "Find en dato",
        responsible_user_id: null,
        description: "Ansvarlig ifølge kilden: Peter",
      },
    ]);
  } finally {
    await db.close();
  }
});
