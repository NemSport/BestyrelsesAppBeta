import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import {
  isManualMinutesApproval,
  previousMinutesAgendaStatus,
} from "../../src/lib/previous-minutes-approval";
import type { PreviousMeetingMinutesReference } from "../../src/types/domain";

const org = "00000000-0000-4000-8000-000000000001";
const committee = "00000000-0000-4000-8000-000000000002";
const meeting = "00000000-0000-4000-8000-000000000003";
const minutes = "00000000-0000-4000-8000-000000000004";
const chair = "00000000-0000-4000-8000-000000000005";
const alma = "00000000-0000-4000-8000-000000000006";
const bo = "00000000-0000-4000-8000-000000000007";
const almaApproval = "00000000-0000-4000-8000-000000000008";
const boApproval = "00000000-0000-4000-8000-000000000009";

test("manual approval records the chair and waits for members who requested changes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$
        select current_setting('test.actor')::uuid
      $$;
      create function public.can_manage_committee(uuid) returns boolean language sql as $$
        select $1 = '${committee}' and auth.uid() = '${chair}'
      $$;
      create function public.can_approve_meeting_minutes(uuid) returns boolean language sql as $$
        select $1 = '${minutes}' and auth.uid() in ('${alma}', '${bo}')
      $$;
      create type public.meeting_minute_approval_status as enum ('pending','approved','change_requested','no_response');
      create table public.organizations(id uuid, deleted_at timestamptz);
      create table public.committees(id uuid, organization_id uuid, deleted_at timestamptz, archived_at timestamptz);
      create table public.meetings(id uuid, organization_id uuid, committee_id uuid, deleted_at timestamptz, status text);
      create table public.meeting_minutes(
        id uuid, organization_id uuid, committee_id uuid, meeting_id uuid,
        status text, approval_deadline date, updated_by uuid
      );
      create table public.meeting_minute_approvals(
        id uuid, meeting_minutes_id uuid, user_id uuid, status public.meeting_minute_approval_status,
        comment text, responded_at timestamptz, updated_by uuid, created_at timestamptz default now()
      );
      insert into organizations values ('${org}', null);
      insert into committees values ('${committee}', '${org}', null, null);
      insert into meetings values ('${meeting}', '${org}', '${committee}', null, 'completed');
      insert into meeting_minutes values
        ('${minutes}', '${org}', '${committee}', '${meeting}', 'ready_for_approval', current_date - 1, '${chair}');
      insert into meeting_minute_approvals
        (id, meeting_minutes_id, user_id, status, updated_by) values
        ('${almaApproval}', '${minutes}', '${alma}', 'pending', '${chair}'),
        ('${boApproval}', '${minutes}', '${bo}', 'pending', '${chair}');
    `);

    await db.exec(
      await readFile(
        "supabase/migrations/202611160003_manual_minutes_approval.sql",
        "utf8",
      ),
    );
    const actor = (user: string) =>
      db.query("select set_config('test.actor', $1, false)", [user]);
    const manual = (approval: string) =>
      db.query<{
        status: "approved";
        updated_by: string;
        user_id: string;
        responded_at: Date;
      }>(
        "select * from public.record_manual_meeting_minutes_approval($1, $2)",
        [minutes, approval],
      );
    const status = async () =>
      (
        await db.query<{ status: string }>(
          "select status from meeting_minutes where id = $1",
          [minutes],
        )
      ).rows[0].status;
    const respond = (answer: string, comment: string | null) =>
      db.query(
        "select * from public.respond_to_meeting_minutes_approval($1, $2, $3)",
        [minutes, answer, comment],
      );

    await actor(bo);
    await assert.rejects(manual(almaApproval), { code: "42501" });
    await respond("change_requested", "Ret beløbet til 5.000 kr.");
    await actor(chair);
    await assert.rejects(manual(boApproval), { code: "22023" });
    await db.query("select * from public.mark_missing_approval_responses($1)", [
      minutes,
    ]);
    assert.equal(await status(), "ready_for_approval");
    const {
      rows: [recorded],
    } = await manual(almaApproval);
    assert.equal(recorded.user_id, alma);
    assert.equal(recorded.updated_by, chair);
    assert.ok(recorded.responded_at);
    assert.ok(isManualMinutesApproval(recorded));
    assert.deepEqual((await manual(almaApproval)).rows[0], recorded);
    assert.equal(await status(), "ready_for_approval");
    const {
      rows: [change],
    } = await db.query(
      "select status, comment from meeting_minute_approvals where id=$1",
      [boApproval],
    );
    assert.deepEqual(change, {
      status: "change_requested",
      comment: "Ret beløbet til 5.000 kr.",
    });
    await actor(bo);
    await respond("approved", null);
    assert.equal(await status(), "approved");

    // A new round uses new row IDs. The previous button cannot approve it.
    const newApproval = "00000000-0000-4000-8000-000000000010";
    await db.query(
      "update meeting_minutes set status='ready_for_approval' where id=$1",
      [minutes],
    );
    await db.query(
      "update meeting_minute_approvals set id=$1, status='pending', responded_at=null where id=$2",
      [newApproval, almaApproval],
    );
    await actor(chair);
    await assert.rejects(manual(almaApproval), { code: "22023" });
    assert.equal(await status(), "ready_for_approval");
    await manual(newApproval);
    assert.equal(await status(), "approved");
  } finally {
    await db.close();
  }
});

test("previous minutes determine whether the next agenda point is complete", () => {
  const reference: PreviousMeetingMinutesReference = {
    meeting: {
      id: meeting,
      title: "Testmøde",
      starts_at: "2026-11-10T16:00:00Z",
    },
    minutes: { status: "approved", minutes_text: "", decisions: "" },
    agendaItemMinutes: [],
    canManageApproval: true,
    approvals: [
      {
        id: almaApproval,
        user_id: alma,
        updated_by: chair,
        memberName: "Alma",
        status: "approved",
        comment: null,
      },
    ],
  };

  assert.equal(
    previousMinutesAgendaStatus(reference, "not_started"),
    "decision_approved",
  );
  for (const status of [
    "pending",
    "change_requested",
    "no_response",
  ] as const) {
    assert.equal(
      previousMinutesAgendaStatus(
        {
          ...reference,
          approvals: [{ ...reference.approvals[0], status }],
        },
        "decision_approved",
      ),
      "not_started",
    );
  }
  assert.equal(
    previousMinutesAgendaStatus(
      { ...reference, meeting: null },
      "needs_decision",
    ),
    "needs_decision",
  );
});
