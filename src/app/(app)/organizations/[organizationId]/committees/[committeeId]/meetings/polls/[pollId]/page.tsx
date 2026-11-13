import Link from "next/link";
import { notFound } from "next/navigation";
import { ManageMeetingPoll } from "@/components/meetings/meeting-poll-controls";
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
      <section className="panel p-4">
        <h2 className="mb-3 font-semibold">Tilgængelighed</h2>
        <ul className="divide-y divide-line">
          {poll.options.map((date, index) => {
            const available = voters.filter((voter) =>
              voter.choices?.includes(index + 1),
            );
            return (
              <li className="py-3" key={date}>
                <p className="font-medium">
                  {formatDateTime(date)}{" "}
                  <span className="ml-2 text-sm text-muted">
                    {available.length} kan deltage
                  </span>
                </p>
                {available.length ? (
                  <p className="break-words text-sm text-muted">
                    {available.map((voter) => voter.email).join(", ")}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
      <section className="panel p-4">
        <h2 className="mb-3 font-semibold">Deltagere</h2>
        <ul className="divide-y divide-line">
          {voters.map((voter) => (
            <li
              className="flex flex-wrap justify-between gap-2 py-3"
              key={voter.email}
            >
              <div className="min-w-0 break-words">
                {voter.email}{" "}
                <span className="ml-2 text-sm text-muted">
                  {voter.choices === null
                    ? "Afventer svar"
                    : voter.choices.length
                      ? "Har svaret"
                      : "Ingen tider passer"}
                </span>
              </div>
              {!poll.meeting_id ? (
                <Link
                  className="text-sm text-brand underline"
                  href={`/meeting-vote/${voter.token}`}
                >
                  Personligt link
                  <span className="sr-only"> til {voter.email}</span>
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
