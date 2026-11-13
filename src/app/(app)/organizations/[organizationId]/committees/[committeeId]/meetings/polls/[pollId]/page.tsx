import Link from "next/link";
import { notFound } from "next/navigation";
import { ManageMeetingPoll } from "@/components/meetings/meeting-poll-controls";
import { MeetingPollResults } from "@/components/meetings/meeting-poll-results";
import { PageHeader, buttonClassName } from "@/components/ui";
import { formatDateTime } from "@/lib/localization";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation";
import { MeetingSchedulingService } from "@/services/meeting-scheduling-service";
import { AppError } from "@/lib/errors";

export default async function MeetingPollPage({
  params,
}: {
  params: Promise<{
    organizationId: string;
    committeeId: string;
    pollId: string;
  }>;
}) {
  const { organizationId, committeeId, pollId } = await params;
  if (!uuidSchema.safeParse(pollId).success) notFound();
  const meetingsRoot = `/organizations/${organizationId}/committees/${committeeId}/meetings`;
  const { poll, voters } = await new MeetingSchedulingService(
    await createClient(),
  )
    .get({ organizationId, committeeId }, pollId)
    .catch((error: unknown) => {
      if (error instanceof AppError && [403, 404].includes(error.statusCode))
        notFound();
      throw error;
    });
  return (
    <div className="section-stack">
      <PageHeader
        title={poll.title}
        eyebrow="Datoafstemning"
        description={`${voters.filter((voter) => voter.choices !== null).length} af ${voters.length} har svaret.`}
      />
      {poll.meeting_id && poll.selected_at ? (
        <div className="flex flex-wrap items-center gap-3">
          <p>Valgt tidspunkt {formatDateTime(poll.selected_at)}</p>
          <Link
            className={buttonClassName()}
            href={`${meetingsRoot}/${poll.meeting_id}#meeting-invitation`}
          >
            Åbn mødeindkaldelse
          </Link>
        </div>
      ) : (
        <ManageMeetingPoll
          organizationId={organizationId}
          committeeId={committeeId}
          pollId={pollId}
          options={poll.options}
          meetingsRoot={meetingsRoot}
        />
      )}
      <MeetingPollResults
        options={poll.options}
        voters={voters}
        labels={voters.map(({ email }) => email)}
      />
      {!poll.meeting_id ? (
        <section className="panel p-4">
          <h2 className="mb-3 font-semibold">Personlige svarlinks</h2>
          <ul className="divide-y divide-line">
            {voters.map(({ email, token }) => (
              <li className="flex flex-wrap justify-between gap-2 py-3" key={email}>
                <span className="min-w-0 break-words">{email}</span>
                <Link className="text-sm text-brand underline" href={`/meeting-vote/${token}`}>
                  Personligt link
                  <span className="sr-only"> til {email}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
