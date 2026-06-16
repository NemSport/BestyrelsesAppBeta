import { JobCardRegister } from "@/components/job-cards/job-card-register";
import { OrganizationNav } from "@/components/layout/organization-nav";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { JobCardService } from "@/services/job-card-service";

export default async function JobCardsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const data = await new JobCardService(await createClient()).getOverview(
    organizationId,
  );
  return (
    <div>
      <OrganizationNav organizationId={organizationId} />
      <PageHeader
        className="mb-8"
        description="Dokumentér roller, ansvar og onboarding, så vigtig viden bliver i organisationen."
        eyebrow="Digital håndbog"
        title="Jobkort og roller"
      />
      <JobCardRegister data={data} organizationId={organizationId} />
    </div>
  );
}
