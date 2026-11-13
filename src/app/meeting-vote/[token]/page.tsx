import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui";
import { formatDateTime } from "@/lib/localization";
import { meetingVoteInput } from "@/lib/meeting-scheduling";
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
  const voter = await new MeetingSchedulingRepository().voter(token);
  if (!voter) notFound();
  const { poll, choices } = voter;
  const result = (await searchParams).result;
  const now = Date.now();
  const open =
    !poll.meeting_id && poll.options.some((date) => Date.parse(date) > now);

  async function submit(form: FormData) {
    "use server";
    const selected = meetingVoteInput.safeParse(
      form.getAll("choice").map(Number),
    );
    const saved =
      selected.success &&
      (await new MeetingSchedulingRepository().vote(token, selected.data));
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
          <fieldset className="space-y-2">
            <legend className="mb-3">
              Vælg alle tidspunkter, hvor du kan deltage. Lad felterne stå
              tomme, hvis ingen tider passer.
            </legend>
            {poll.options.map((date, index) => {
              const expired = Date.parse(date) <= now;
              return (
                <label
                  className="flex min-h-12 items-center gap-3 rounded-lg border border-line px-3 py-2"
                  key={date}
                >
                  <input
                    type="checkbox"
                    name="choice"
                    value={index + 1}
                    disabled={expired}
                    defaultChecked={choices?.includes(index + 1)}
                  />
                  <span>
                    {formatDateTime(date, "full")}
                    {expired ? " · Passeret" : ""}
                  </span>
                </label>
              );
            })}
          </fieldset>
          <Button type="submit">Gem mit svar</Button>
        </form>
      ) : (
        <p className="mt-4">
          {poll.selected_at
            ? `Mødet er fastlagt til ${formatDateTime(poll.selected_at, "full")}.`
            : "Datoafstemningen er lukket."}
        </p>
      )}
    </main>
  );
}
