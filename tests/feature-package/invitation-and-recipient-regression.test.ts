import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

import { authHref, getAuthRedirect } from "../../src/lib/auth-navigation";
import { matchesMeetingMaterialRecipients } from "../../src/lib/meeting-material-dispatch";

test("dispatch checks the displayed email set even when the recipient count is unchanged", () => {
  const recipients = [
    { email: "first@example.test" },
    { email: "second@example.test" },
  ];
  assert.equal(
    matchesMeetingMaterialRecipients(recipients, [
      "SECOND@example.test",
      "first@example.test",
    ]),
    true,
  );
  assert.equal(
    matchesMeetingMaterialRecipients(recipients, [
      "first@example.test",
      "different@example.test",
    ]),
    false,
  );
  assert.equal(
    matchesMeetingMaterialRecipients(recipients, ["first@example.test"]),
    false,
  );
});

test("auth links retain the invitation and reject external redirects", () => {
  const next = `/invite/${randomUUID()}`;
  const url = new URL(authHref("/signup", next), "https://app.example.test");
  assert.equal(getAuthRedirect(url.searchParams.get("next")), next);
  for (const path of ["/forgot-password", "/reset-password"] as const) {
    const recovery = new URL(authHref(path, next), "https://app.example.test");
    assert.equal(recovery.pathname, path);
    assert.equal(getAuthRedirect(recovery.searchParams.get("next")), next);
  }
  for (const external of [
    "https://elsewhere.test",
    "//elsewhere.test",
    "/\\elsewhere.test",
    "/\t/elsewhere.test",
  ]) {
    assert.equal(getAuthRedirect(external), "/organizations");
  }
});

test("a verified invitee can accept once without changing an existing role", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create table organizations(id uuid primary key, name text, deleted_at timestamptz);
      create type organization_role as enum ('owner', 'admin', 'member', 'viewer');
      create type membership_status as enum ('active', 'suspended');
      create type invitation_status as enum ('pending', 'accepted', 'revoked');
      create table organization_members (
        organization_id uuid, user_id uuid, role organization_role,
        status membership_status not null default 'active',
        primary key (organization_id, user_id)
      );
      create table organization_invitations (
        id uuid primary key, organization_id uuid, email text, role organization_role,
        status invitation_status not null default 'pending',
        invited_by uuid, updated_at timestamptz not null default now()
      );
    `);
    await db.exec(
      await readFile(
        "supabase/migrations/202611110001_organization_invitation_delivery.sql",
        "utf8",
      ),
    );
    const [
      organization,
      otherOrg,
      owner,
      recipient,
      outsider,
      invitation,
      expired,
      elevated,
    ] = Array.from({ length: 8 }, () => randomUUID());
    await db.query(
      "insert into organizations values ($1, 'Testorganisation', null), ($2, 'Anden organisation', null)",
      [organization, otherOrg],
    );
    await db.query(
      "insert into auth.users values ($1, 'owner@example.test', now()), ($2, 'Member@Example.Test', null), ($3, 'other@example.test', now())",
      [owner, recipient, outsider],
    );
    await db.query(
      "insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'admin')",
      [organization, owner, outsider],
    );
    await db.query(
      `
      insert into organization_invitations (id, organization_id, email, role, invited_by, updated_at)
      values ($1, $2, 'member@example.test', 'viewer', $3, now()),
             ($4, $2, 'member@example.test', 'viewer', $3, now() - interval '8 days'),
             ($5, $2, 'member@example.test', 'owner', $3, now())
    `,
      [invitation, organization, owner, expired, elevated],
    );
    const respond = async (actor: string, id: string, accept: boolean) => {
      await db.query("select set_config('test.user_id', $1, false)", [actor]);
      await db.exec("set role authenticated");
      try {
        return (
          await db.query<{
            organization_id: string;
            invited_role: string;
            invitation_status: string;
          }>("select * from respond_to_organization_invitation($1,$2)", [
            id,
            accept,
          ])
        ).rows;
      } finally {
        await db.exec("reset role");
      }
    };

    assert.equal((await respond(outsider, invitation, true)).length, 0);
    assert.equal((await respond(recipient, invitation, true)).length, 0);
    await db.query(
      "update auth.users set email_confirmed_at = now() where id=$1",
      [recipient],
    );
    assert.equal((await respond(recipient, expired, true)).length, 0);
    assert.equal(
      (await respond(recipient, invitation, false))[0].invitation_status,
      "pending",
    );
    const member = () =>
      db.query<{ role: string }>(
        "select role from organization_members where user_id=$1",
        [recipient],
      );
    assert.equal((await member()).rows.length, 0);

    await db.query("select set_config('test.user_id', $1, false)", [outsider]);
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select resend_organization_invitation($1,$2)", [
        organization,
        elevated,
      ]),
      /kan ikke sendes igen/,
    );
    await assert.rejects(
      db.query("select resend_organization_invitation($1,$2)", [
        organization,
        randomUUID(),
      ]),
      /kan ikke sendes igen/,
    );
    await db.exec("reset role");
    await db.query("select set_config('test.user_id', $1, false)", [owner]);
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select resend_organization_invitation($1,$2)", [
        otherOrg,
        invitation,
      ]),
      /Kun ejere/,
    );
    await db.query("select resend_organization_invitation($1,$2)", [
      organization,
      expired,
    ]);
    await db.exec("reset role");
    assert.equal(
      (await respond(recipient, expired, false))[0].invitation_status,
      "pending",
    );

    assert.equal(
      (await respond(recipient, invitation, true))[0].invitation_status,
      "accepted",
    );
    assert.equal(
      (await respond(recipient, invitation, true))[0].organization_id,
      organization,
    );
    assert.equal(
      (await respond(recipient, elevated, true))[0].invitation_status,
      "accepted",
    );
    assert.deepEqual((await member()).rows, [{ role: "viewer" }]);
    await db.query("delete from organization_members where user_id=$1", [
      recipient,
    ]);
    assert.equal((await respond(recipient, invitation, true)).length, 0);
    assert.equal((await member()).rows.length, 0);
  } finally {
    await db.close();
  }
});
