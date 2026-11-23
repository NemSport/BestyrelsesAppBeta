import { notFound } from "next/navigation";

import { HistoricalMeetingImport } from "@/components/meetings/historical-meeting-import";
import { createClient } from "@/lib/supabase/server";
import { OrganizationService } from "@/services/organization-service";

export default async function MeetingImportPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const db = await createClient();
  const overview = await new OrganizationService(db).getOverview(
    organizationId,
  );
  const committees = overview.committees
    .filter(({ capabilities }) => capabilities.createMeeting)
    .map(({ committee: { id, name } }) => ({ id, name }));
  if (!committees.length) notFound();

  return (
    <HistoricalMeetingImport
      organizationId={organizationId}
      committees={committees}
    />
  );
}
