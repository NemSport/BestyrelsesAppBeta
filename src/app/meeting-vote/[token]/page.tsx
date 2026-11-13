import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MeetingPollResults } from "@/components/meetings/meeting-poll-results";
import { Button } from "@/components/ui";
import { formatDateTime } from "@/lib/localization";
import { meetingVoteAnswer, meetingVoteAnswers, meetingVoteInput } from "@/lib/meeting-scheduling";
import { uuidSchema } from "@/lib/validation";
import { MeetingSchedulingRepository } from "@/repositories/meeting-scheduling-repository";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Datoafstemning",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function MeetingVotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { token } = await params;
  if (!uuidSchema.safeParse(token).success) notFound();
  const repository = new MeetingSchedulingRepository();
  const voter = await repository.voter(token);
  if (!voter) notFound();
  const { poll } = voter;
  const result = (await searchParams).result;
  const now = Date.now();
  const openOptions = poll.options
    .map((date, index) => ({ date, position: index + 1 }))
    .filter(({ date }) => Date.parse(date) > now);
  const open = !poll.meeting_id && openOptions.length > 0;
  const participants = voter.choices === null ? [] : await repository.voters(poll.id);

  async function submit(form: FormData) {
    "use server";
    const selected = meetingVoteInput.safeParse({
      answers: openOptions.map(({ position }) => ({
        choice: form.get(`answer-${position}`),
        comment: form.get(`comment-${position}`),
      })),
    });
    let saved = false;
    if (selected.success) {
      const answers: { yes: number[]; maybe: number[]; no: number[] } = {
        yes: [], maybe: [], no: [],
      };
      const comments: Record<string, string> = {};
      selected.data.answers.forEach(({ choice, comment }, index) => {
        const { position } = openOptions[index];
        answers[choice].push(position);
        if (comment) comments[position] = comment;
      });
      saved = await new MeetingSchedulingRepository().vote(token, answers, comments);
    }
    redirect(`/meeting-vote/${token}?result=${saved ? "saved" : "closed"}`);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <h1 className="break-words text-2xl font-semibold">{poll.title}</h1>
      {result === "saved" ? (
        <p className="mt-3 font-medium text-brand" role="status">
          Dit svar er gemt.
        </p>
      ) : null}
      {result === "closed" ? (
        <p className="mt-3 text-danger" role="alert">
          Svaret kunne ikke gemmes. Tjek, hvilke tider der stadig er åbne.
        </p>
      ) : null}
      {open ? (
        <form action={submit} className="mt-5 space-y-4">
          <p className="text-sm text-muted" id="vote-comment-help">
            De andre deltagere kan se dine kommentarer sammen med dine svar.
          </p>
          {openOptions.map(({ date, position }) => (
            <fieldset className="rounded-lg border border-line px-3 pb-3" key={date}>
              <legend className="px-1 font-medium">{formatDateTime(date, "full")}</legend>
              <div className="flex flex-wrap gap-2">
                {Object.entries(meetingVoteAnswers).map(([answer, label]) => (
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-line px-3 has-[:checked]:border-brand" key={answer}>
                    <input
                      type="radio"
                      name={`answer-${position}`}
                      value={answer}
                      required
                      defaultChecked={meetingVoteAnswer(voter, position) === answer}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <label className="mt-3 block text-sm">
                Kommentar til tidspunktet (valgfri)
                <textarea
                  name={`comment-${position}`}
                  rows={2}
                  maxLength={500}
                  defaultValue={voter.option_comments[position] ?? ""}
                  className="mt-1 block w-full rounded-lg border border-line bg-canvas p-2"
                  aria-describedby="vote-comment-help"
                />
              </label>
            </fieldset>
          ))}
          <Button type="submit">Gem mit svar</Button>
        </form>
      ) : (
        <p className="mt-4">
          {poll.selected_at
            ? `Mødet er fastlagt til ${formatDateTime(poll.selected_at, "full")}.`
            : "Datoafstemningen er lukket."}
        </p>
      )}
      {participants.length > 0 ? (
        <MeetingPollResults
          options={poll.options}
          voters={participants}
          labels={participants.map(({ token: voterToken }, index) =>
            voterToken === token ? "Dig" : `Deltager ${index + 1}`,
          )}
        />
      ) : null}
    </main>
  );
}
