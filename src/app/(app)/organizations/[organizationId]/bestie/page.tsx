import { BestieInbox } from "@/components/bestie/bestie-inbox";
import { NotFoundError } from "@/lib/errors";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation";
import { BestieService, bestieThread } from "@/services/bestie-service";

export default async function BestiePage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ samtale?: string }>;
}) {
  const { organizationId } = await params;
  const requested = uuidSchema.safeParse((await searchParams).samtale);
  const service = new BestieService(await createClient());
  const threads = await service.list(organizationId);
  const selected = requested.success ? requested.data : null;
  if (selected && !threads.some((thread) => thread.id === selected)) {
    const thread = await service
      .requireThread(organizationId, selected)
      .catch((error: unknown) => {
        if (error instanceof NotFoundError) return null;
        throw error;
      });
    if (thread) threads.push(bestieThread(thread));
  }

  return (
    <div className="section-stack">
      <PageHeader title="Bestie" />
      <BestieInbox
        key={selected ?? "inbox"}
        organizationId={organizationId}
        initialThreads={threads}
        selected={selected}
      />
    </div>
  );
}
