import { notFound } from "next/navigation";

import { ActionCenter } from "@/components/actions/action-center";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { ActionService } from "@/services/action-service";

export default async function ActionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { organizationId } = await params;
  const requestedView = (await searchParams).view;
  const view =
    requestedView === "mine" || requestedView === "completed"
      ? requestedView
      : "inbox";
  const center = await new ActionService(await createClient())
    .getCenter(organizationId)
    .catch(() => null);
  if (!center) notFound();

  return (
    <div className="page-flow">
      <PageHeader
        description="Løs det underliggende arbejde, udskyd det eller markér det aktivt som ikke relevant."
        eyebrow="Personligt arbejdsflow"
        title="Handlinger"
      />
      <ActionCenter center={center} organizationId={organizationId} view={view} />
    </div>
  );
}
