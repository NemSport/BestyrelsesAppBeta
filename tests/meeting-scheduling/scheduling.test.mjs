import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const org = "00000000-0000-4000-8000-000000000001";
const committee = "00000000-0000-4000-8000-000000000002";
const member = "00000000-0000-4000-8000-000000000003";
before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as
      $$ select '00000000-0000-4000-8000-000000000004'::uuid $$;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create table organizations (id uuid primary key, deleted_at timestamptz);
    create table committees (id uuid primary key, organization_id uuid, deleted_at timestamptz, archived_at timestamptz);
    create table organization_members (organization_id uuid, user_id uuid, status text);
    create table committee_members (committee_id uuid, user_id uuid, status text);
    create table meetings (id uuid primary key default gen_random_uuid(), organization_id uuid, committee_id uuid,
      title text, starts_at timestamptz, status text default 'scheduled', deleted_at timestamptz);
    create table meeting_attendees (organization_id uuid, committee_id uuid, meeting_id uuid, user_id uuid);
    create table meeting_external_attendees (organization_id uuid, committee_id uuid, meeting_id uuid,
      name text, email text, created_by uuid, updated_by uuid);
    create function public.is_organization_member(uuid) returns boolean language sql as $$ select true $$;
    create function public.is_organization_admin(uuid) returns boolean language sql as $$ select false $$;
    create function public.can_manage_committee(uuid) returns boolean language sql as
      $$ select current_setting('test.manager', true) = 'yes' $$;
    create function public.create_meeting_with_standard_items(uuid, uuid, text, text, timestamptz, timestamptz, text)
      returns public.meetings language sql as
      $$ insert into public.meetings(organization_id,committee_id,title,starts_at) values ($1,$2,$3,$5) returning * $$;
  `);
  await db.query("insert into organizations values ($1,null)", [org]);
  await db.query("insert into committees values ($1,$2,null,null)", [
    committee,
    org,
  ]);
  await db.query(
    "insert into auth.users values ($1,'member@example.test',now())",
    [member],
  );
  await db.query("insert into organization_members values ($1,$2,'active')", [
    org,
    member,
  ]);
  await db.query("insert into committee_members values ($1,$2,'active')", [
    committee,
    member,
  ]);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202611130003_meeting_scheduling.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
test("upgraded ballots keep old votes and save yes, maybe, no and a comment", async () => {
  await db.exec("set test.manager='yes'");
  const poll = await scalar(
    `select create_meeting_date_poll($1,$2,'Test af svar',
      array[now() + interval '1 day', now() + interval '2 days', now() + interval '3 days'],
      array['legacy@example.test','new@example.test'])`,
    [org, committee],
  );
  const { rows: [legacy, pending] } = await db.query(
    "select token from meeting_date_poll_voters where poll_id=$1 order by email",
    [poll],
  );
  assert.equal(await scalar("select submit_meeting_date_vote($1,array[1])", [legacy.token]), true);
  await db.exec(await readFile(new URL(
    "../../supabase/migrations/202611130004_meeting_date_poll_answers.sql", import.meta.url,
  ), "utf8"));
  const result = async (token) => (await db.query(
    "select choices,maybe_choices,comment from meeting_date_poll_voters where token=$1",
    [token],
  )).rows[0];
  assert.deepEqual(await result(legacy.token), { choices: [1], maybe_choices: [], comment: null });
  assert.deepEqual(await result(pending.token), { choices: null, maybe_choices: [], comment: null });
  const submit = (yes, maybe, no, comment) => scalar(
    "select submit_meeting_date_vote_details($1,$2,$3,$4,$5)",
    [pending.token, yes, maybe, no, comment],
  );
  assert.equal(await submit([1], [1], [3], "Overlap"), false);
  assert.equal(await submit([1], [], [3], "Incomplete"), false);
  assert.equal(await submit([1], [2], [3], " Efter kl. 17 "), true);
  assert.deepEqual(await result(pending.token), { choices: [1], maybe_choices: [2], comment: "Efter kl. 17" });
  assert.equal(await submit([], [], [1, 2, 3], ""), true);
  assert.deepEqual(await result(pending.token), { choices: [], maybe_choices: [], comment: null });
  assert.equal(await scalar(
    "select submit_meeting_date_vote_details($1,array[1],array[2],array[3],'Generel kommentar')",
    [legacy.token],
  ), true);
  await db.exec(await readFile(new URL(
    "../../supabase/migrations/202611130005_meeting_date_poll_time_comments.sql", import.meta.url,
  ), "utf8"));
  const timeComments = (token) => scalar(
    "select option_comments from meeting_date_poll_voters where token=$1",
    [token],
  );
  const submitWithComments = (comments) => scalar(
    "select submit_meeting_date_vote_with_comments($1,array[1],array[2],array[3],$2)",
    [legacy.token, JSON.stringify(comments)],
  );
  assert.equal(await submitWithComments({ 4: "Ukendt tidspunkt" }), false);
  assert.equal(await submitWithComments({ 2: " ".repeat(501) }), false);
  assert.deepEqual(await timeComments(legacy.token), {});
  assert.equal(await submitWithComments({ 1: "Passer fint", 2: " Hvis vi rykker til 17.30 " }), true);
  assert.deepEqual(await timeComments(legacy.token), { 1: "Passer fint", 2: "Hvis vi rykker til 17.30" });
  assert.equal(await submitWithComments({ 2: "Hvis vi rykker til 17.30" }), true);
  assert.deepEqual(await timeComments(legacy.token), { 2: "Hvis vi rykker til 17.30" });
  assert.deepEqual(await result(legacy.token), { choices: [1], maybe_choices: [2], comment: "Generel kommentar" });

});

after(async () => db.close());

async function scalar(sql, values) {
  return Object.values((await db.query(sql, values)).rows[0])[0];
}

test("scoped poll supports multiple choices, no availability, and one finalized meeting", async () => {
  const create = () =>
    scalar(
      `
    select create_meeting_date_poll($1,$2,'Testmøde',
      array[now() + interval '1 day', now() + interval '2 days'],
      array['Member@example.test','guest@example.test'])
  `,
      [org, committee],
    );
  await db.exec("set test.manager='no'");
  await assert.rejects(create(), { code: "42501" });
  await db.exec("set test.manager='yes'");
  const poll = await create();
  const { rows: voters } = await db.query(
    "select * from meeting_date_poll_voters where poll_id=$1 order by email",
    [poll],
  );
  const vote = (token, choices) =>
    scalar("select submit_meeting_date_vote($1,$2)", [token, choices]);
  assert.equal(await vote(voters[0].token, [1, 2, 2]), true);
  assert.deepEqual(
    await scalar(
      "select choices from meeting_date_poll_voters where token=$1",
      [voters[0].token],
    ),
    [1, 2],
  );
  assert.equal(await vote(voters[1].token, [3]), false);
  assert.equal(await vote(voters[0].token, []), true);
  assert.deepEqual(
    await scalar(
      "select choices from meeting_date_poll_voters where token=$1",
      [voters[0].token],
    ),
    [],
  );
  assert.equal(
    await scalar(
      "select choices from meeting_date_poll_voters where token=$1",
      [voters[1].token],
    ),
    null,
  );
  const finalize = () =>
    scalar("select finalize_meeting_date_poll($1,$2,$3,2)", [
      org,
      committee,
      poll,
    ]);
  await db.exec("set test.manager='no'");
  await assert.rejects(finalize(), { code: "42501" });
  await db.exec("set test.manager='yes'");
  const meeting = await finalize();
  assert.equal(await finalize(), meeting);
  assert.equal(await vote(voters[0].token, [1]), false);
  assert.equal(
    await scalar("select user_id from meeting_attendees where meeting_id=$1", [
      meeting,
    ]),
    member,
  );
  assert.equal(
    await scalar(
      "select email from meeting_external_attendees where meeting_id=$1",
      [meeting],
    ),
    "guest@example.test",
  );
});

test("invitation replies can change and old links stop accepting answers after rescheduling", async () => {
  const meeting = await scalar(
    "insert into meetings(organization_id,committee_id,starts_at) values($1,$2,now()+interval '5 days') returning id",
    [org, committee],
  );
  const token = await scalar(
    `
    insert into meeting_invitation_responses(meeting_id,starts_at,email,name)
    select id,starts_at,'guest@example.test','Guest' from meetings where id=$1 returning token
  `,
    [meeting],
  );
  const respond = (answer) =>
    scalar("select submit_meeting_invitation_response($1,$2)", [token, answer]);
  assert.equal(await respond("accepted"), true);
  assert.equal(await respond("declined"), true);
  assert.equal(await respond("unknown"), false);
  await db.query(
    "update meetings set starts_at=starts_at+interval '1 day' where id=$1",
    [meeting],
  );
  assert.equal(await respond("accepted"), false);
  assert.equal(
    await scalar(
      "select response from meeting_invitation_responses where token=$1",
      [token],
    ),
    "declined",
  );
  await db.exec("set role anon");
  try {
    await assert.rejects(respond("accepted"), { code: "42501" });
    await assert.rejects(
      db.query("select * from meeting_invitation_responses"),
      { code: "42501" },
    );
  } finally {
    await db.exec("reset role");
  }
});

test("email push resolves only subscribed accounts with a verified matching address", async () => {
  const unverified = "00000000-0000-4000-8000-000000000005";
  await db.exec(`
    create table bestie_push_subscriptions (user_id uuid, endpoint text, keys jsonb);
    insert into bestie_push_subscriptions values
      ('${member}', 'member-device', '{}'),
      ('${unverified}', 'unverified-device', '{}');
    insert into auth.users values ('${unverified}', 'unverified@example.test', null);
  `);
  await db.exec(await readFile(new URL(
    "../../supabase/migrations/202611130006_email_push_subscriptions.sql", import.meta.url,
  ), "utf8"));
  const lookup = () => db.query("select email,endpoint from email_push_subscriptions($1)", [
    ["member@example.test", "unverified@example.test", "external@example.test"],
  ]);
  await db.exec("set role authenticated");
  try {
    await assert.rejects(lookup(), { code: "42501" });
  } finally {
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  try {
    assert.deepEqual((await lookup()).rows, [
      { email: "member@example.test", endpoint: "member-device" },
    ]);
  } finally {
    await db.exec("reset role");
  }
});
