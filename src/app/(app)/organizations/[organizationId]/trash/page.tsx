import { OrganizationTrash } from "@/components/trash/organization-trash";
import { TrashAccessDenied } from "@/components/trash/trash-access-denied";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { canManageOrganizationTrash } from "@/lib/trash-capabilities";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { TrashService } from "@/services/trash-service";

export default async function OrganizationTrashPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db).requireOrganizationMember(
    organizationId,
    user.id,
  );
  if (!canManageOrganizationTrash(context.membership.role)) {
    return <TrashAccessDenied organizationId={organizationId} />;
  }
  const data = await new TrashService(db).getOrganizationTrash(organizationId);

  return (
    <>
      <PageHeader
        className="mb-4"
        description="Gendan slettede organisationer, udvalg, møder og dagsordenspunkter."
        eyebrow="Administration"
        title="Papirkurv"
      />
      <section
        aria-labelledby="trash-deadline-heading"
        className="mb-4 border-l-2 border-info bg-info-soft/45 px-4 py-3"
      >
        <h2 className="text-sm font-semibold" id="trash-deadline-heading">
          Sådan virker 30-dagesfristen
        </h2>
        <p className="mt-1 text-sm text-muted">
          Efter 30 dage får elementet status <strong>Frist passeret</strong>. Det
          bliver liggende i Papirkurven og kan stadig gendannes. Hvis et
          tilknyttet udvalg også er slettet, skal du gendanne udvalget først.
          Permanent sletning er endnu ikke tilgængelig.
        </p>
      </section>
      <OrganizationTrash data={data} organizationId={organizationId} />
    </>
  );
}
