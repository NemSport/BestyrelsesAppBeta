import { AnnualWheel } from "@/components/annual-wheel/annual-wheel";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { AnnualWheelService } from "@/services/annual-wheel-service";

export default async function CommitteeAnnualWheelPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; committeeId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { organizationId, committeeId } = await params;
  const query = await searchParams;
  const data = await new AnnualWheelService(await createClient()).getOverview(
    organizationId,
    query.year ? Number(query.year) : undefined,
  );

  return (
    <div>
      <PageHeader
        className="mb-8"
        description="Udvalgets aktiviteter, møder og deadlines samlet gennem året."
        eyebrow="Strategisk planlægning"
        title={`Årshjul ${data.year}`}
      />
      <AnnualWheel
        data={data}
        initialCommitteeId={committeeId}
        organizationId={organizationId}
      />
    </div>
  );
}
