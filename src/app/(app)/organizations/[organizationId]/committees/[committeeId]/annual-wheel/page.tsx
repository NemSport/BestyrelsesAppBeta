import { AnnualWheel } from "@/components/annual-wheel/annual-wheel";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { AnnualWheelService } from "@/services/annual-wheel-service";

export default async function CommitteeAnnualWheelPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; committeeId: string }>;
  searchParams: Promise<{ year?: string; create?: string; event?: string }>;
}) {
  const { organizationId, committeeId } = await params;
  const query = await searchParams;
  const annualWheel = new AnnualWheelService(await createClient());
  const eventId = typeof query.event === "string" ? query.event : undefined;
  const activityDate = eventId
    ? await annualWheel.getCommitteeActivityStartDate(
        organizationId,
        committeeId,
        eventId,
      )
    : null;
  const year = activityDate?.slice(0, 4) ?? query.year;
  const data = await annualWheel.getOverview(
    organizationId,
    year ? Number(year) : undefined,
  );

  return (
    <div className="page-flow" data-annual-wheel-page>
      <PageHeader
        description="Planlæg aktiviteter, gentagelser og deadlines, før de bliver akutte."
        eyebrow="Strategisk planlægning"
        title={`Årshjul ${data.year}`}
      />
      <AnnualWheel
        data={data}
        initialCommitteeId={committeeId}
        initialEventId={eventId}
        key={eventId}
        openCreateOnLoad={!eventId && query.create === "1"}
        organizationId={organizationId}
      />
    </div>
  );
}
