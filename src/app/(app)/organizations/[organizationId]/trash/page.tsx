import { OrganizationTrash } from "@/components/trash/organization-trash";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { TrashService } from "@/services/trash-service";

export default async function OrganizationTrashPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const data = await new TrashService(await createClient()).getOrganizationTrash(
    organizationId,
  );

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
