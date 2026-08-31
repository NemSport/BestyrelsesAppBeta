import { AnnualWheel } from "@/components/annual-wheel/annual-wheel";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { AnnualWheelService } from "@/services/annual-wheel-service";

export default async function AnnualWheelPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { organizationId } = await params;
  const query = await searchParams;
  const data = await new AnnualWheelService(await createClient()).getOverview(
    organizationId,
    query.year ? Number(query.year) : undefined,
  );

  return (
    <div className="page-flow" data-annual-wheel-page>
      <PageHeader
        description="Planlæg aktiviteter, gentagelser og deadlines, før de bliver akutte."
        eyebrow="Strategisk planlægning"
        title={`Årshjul ${data.year}`}
      />
      <AnnualWheel data={data} organizationId={organizationId} />
    </div>
  );
}
