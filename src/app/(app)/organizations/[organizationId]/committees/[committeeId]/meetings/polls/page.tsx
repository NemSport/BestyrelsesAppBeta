import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { CreateMeetingPoll } from "@/components/meetings/meeting-poll-controls";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { MeetingSchedulingService } from "@/services/meeting-scheduling-service";

export default async function MeetingPollsPage({
  params,
}: {
  params: Promise<{ organizationId: string; committeeId: string }>;
}) {
  const scope = await params;
  const root = `/organizations/${scope.organizationId}/committees/${scope.committeeId}/meetings/polls`;
  const polls = await new MeetingSchedulingService(await createClient())
    .list(scope)
    .catch((error: unknown) => {
      if (error instanceof AppError && [403, 404].includes(error.statusCode))
        notFound();
      throw error;
    });
  return (
    <div className="section-stack">
      <PageHeader title="Datoafstemninger" />
      <CreateMeetingPoll {...scope} root={root} />
      {polls.length ? (
        <section className="panel max-w-2xl p-5">
          <h2 className="font-semibold">Oprettede afstemninger</h2>
          <ul className="mt-2 divide-y divide-line">
            {polls.map((poll) => (
              <li key={poll.id}>
                <Link
                  className="flex justify-between gap-2 py-3 text-brand"
                  href={`${root}/${poll.id}`}
                >
                  <span>{poll.title}</span>
                  <span className="text-sm text-muted">
                    {poll.meeting_id
                      ? "Dato valgt"
                      : poll.options.some(
                            (date) => Date.parse(date) > Date.now(),
                          )
                        ? "Åben"
                        : "Udløbet"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
