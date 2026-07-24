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
        className="mb-8"
        description="Gendan slettede organisationer, udvalg, møder og dagsordenspunkter. Elementer bevares i 30 dage."
        eyebrow="Administration"
        title="Papirkurv"
      />
      <OrganizationTrash data={data} organizationId={organizationId} />
    </>
  );
}
