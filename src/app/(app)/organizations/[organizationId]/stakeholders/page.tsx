import { StakeholderWorkspace } from "@/components/stakeholders/stakeholder-workspace";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { StakeholderService } from "@/services/stakeholder-service";

export default async function StakeholdersPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const data = await new StakeholderService(await createClient()).getWorkspace(
    organizationId,
  );
  return (
    <div
      className="page-flow w-full max-w-none !gap-3"
      data-stakeholder-workspace
    >
      <PageHeader className="!gap-2 !pb-2" title="Interessenter & Relationer" />
      <StakeholderWorkspace data={data} organizationId={organizationId} />
    </div>
  );
}
