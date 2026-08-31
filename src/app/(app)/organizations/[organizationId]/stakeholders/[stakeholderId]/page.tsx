import { notFound } from "next/navigation";

import { StakeholderProfile } from "@/components/stakeholders/stakeholder-profile";
import { createClient } from "@/lib/supabase/server";
import { NotFoundError } from "@/lib/errors";
import { StakeholderService } from "@/services/stakeholder-service";

export default async function StakeholderPage({
  params,
}: {
  params: Promise<{ organizationId: string; stakeholderId: string }>;
}) {
  const { organizationId, stakeholderId } = await params;
  const data = await new StakeholderService(await createClient())
    .getProfile(organizationId, stakeholderId)
    .catch((error) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    });
  return (
    <div className="page-flow w-full max-w-none" data-stakeholder-profile>
      <StakeholderProfile data={data} organizationId={organizationId} />
    </div>
  );
}
