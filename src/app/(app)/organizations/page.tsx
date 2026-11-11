import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { OrganizationSelector } from "@/components/organizations/organization-selector";
import { Button, staticSurfaceClassName } from "@/components/ui";
import { organizationRoleLabels } from "@/lib/localization";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { OrganizationService } from "@/services/organization-service";

async function acceptInvitation(formData: FormData) {
  "use server";

  const parsed = uuidSchema.safeParse(formData.get("invitationId"));
  if (!parsed.success) redirect("/organizations?invitation=error");

  const db = await createClient();
  const result = await new OrganizationMemberRepository(db)
    .respondToInvitation(parsed.data, true)
    .catch(() => null);
  if (!result) redirect("/organizations?invitation=error");

  revalidatePath("/organizations", "layout");
  redirect(`/organizations/${result.organization_id}`);
}

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  const db = await createClient();
  const [organizations, invitations, params] = await Promise.all([
    new OrganizationService(db).listWorkspaceEntries(),
    new OrganizationMemberRepository(db).listMyInvitations().catch(() => null),
    searchParams,
  ]);

  return (
    <OrganizationSelector
      hasInvitations={Boolean(invitations?.length)}
      organizations={organizations}
    >
      {params.invitation === "error" ? (
        <p className="text-sm text-danger" role="alert">
          Invitationen kunne ikke accepteres. Prøv igen, eller bed organisationen
          om at sende den igen.
        </p>
      ) : null}
      {invitations === null ? (
        <p className="text-sm text-muted" role="status">
          Dine invitationer kunne ikke hentes. Genindlæs siden for at prøve igen.
        </p>
      ) : invitations.length > 0 ? (
        <section
          aria-labelledby="organization-invitations-title"
          className="space-y-3"
        >
          <h2
            className="text-lg font-semibold"
            id="organization-invitations-title"
          >
            Afventende invitationer
          </h2>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {invitations.map((invitation) => (
              <li
                className={staticSurfaceClassName(
                  "flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5",
                )}
                key={invitation.invitation_id}
              >
                <div className="min-w-0">
                  <p className="break-words font-semibold">
                    {invitation.organization_name}
                  </p>
                  <p className="text-sm text-muted">
                    {organizationRoleLabels[invitation.invited_role]}
                  </p>
                </div>
                <form action={acceptInvitation}>
                  <input
                    name="invitationId"
                    type="hidden"
                    value={invitation.invitation_id}
                  />
                  <Button
                    aria-label={`Acceptér invitation til ${invitation.organization_name}`}
                    type="submit"
                  >
                    Acceptér invitation
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </OrganizationSelector>
  );
}
