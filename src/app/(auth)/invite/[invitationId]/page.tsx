import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui";
import { authHref } from "@/lib/auth-navigation";
import { organizationRoleLabels } from "@/lib/localization";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";

export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ invitationId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const parsed = uuidSchema.safeParse((await params).invitationId);
  if (!parsed.success) notFound();

  const invitationId = parsed.data;
  const path = `/invite/${invitationId}`;
  const login = authHref("/login", path);
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const invitation = user
    ? await new OrganizationMemberRepository(db).respondToInvitation(
        invitationId,
        false,
      )
    : null;
  const { error } = await searchParams;

  async function accept() {
    "use server";

    const client = await createClient();
    const result = await new OrganizationMemberRepository(client)
      .respondToInvitation(invitationId, true)
      .catch(() => null);
    if (!result) redirect(`${path}?error=accept`);
    redirect(`/organizations/${result.organization_id}`);
  }

  async function switchAccount() {
    "use server";

    const client = await createClient();
    await client.auth.signOut({ scope: "local" });
    redirect(login);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">Medlemsinvitation</h1>
      {!user ? (
        <>
          <p className="text-sm text-muted">
            Log ind eller opret en konto med den e-mailadresse, der modtog
            invitationen.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className="button-primary" href={login}>
              Log ind
            </Link>
            <Link className="button-secondary" href={authHref("/signup", path)}>
              Opret konto
            </Link>
          </div>
        </>
      ) : invitation ? (
        <>
          <p>
            {invitation.invitation_status === "accepted"
              ? `Du har accepteret invitationen til ${invitation.organization_name}.`
              : `Du er inviteret til ${invitation.organization_name} som ${organizationRoleLabels[invitation.invited_role].toLowerCase()}.`}
          </p>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              Invitationen kunne ikke accepteres. Prøv igen, eller kontakt
              organisationen.
            </p>
          ) : null}
          {invitation.invitation_status === "accepted" ? (
            <Link
              className="button-primary"
              href={`/organizations/${invitation.organization_id}`}
            >
              Åbn organisationen
            </Link>
          ) : (
            <form action={accept}>
              <Button type="submit">Acceptér invitation</Button>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            Invitationen er udløbet, eller den kan ikke bruges med denne konto.
            Log ind med den e-mailadresse, der modtog invitationen, eller bed
            organisationen om at sende den igen.
          </p>
          <form action={switchAccount}>
            <Button type="submit" variant="secondary">
              Log ind med en anden konto
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
