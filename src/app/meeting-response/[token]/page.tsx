import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui";
import { formatDateTime } from "@/lib/localization";
import {
  meetingCanReceiveResponses,
  meetingResponseInput,
  meetingResponseLabel,
} from "@/lib/meeting-scheduling";
import { uuidSchema } from "@/lib/validation";
import { MeetingSchedulingRepository } from "@/repositories/meeting-scheduling-repository";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Svar på mødeindkaldelse",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function MeetingResponsePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ answer?: string; result?: string }>;
}) {
  const { token } = await params;
  if (!uuidSchema.safeParse(token).success) notFound();
  const record = await new MeetingSchedulingRepository().invitation(token);
  if (!record) notFound();
  const { meeting, invitation } = record;
  const query = await searchParams;
  const preferred = meetingResponseInput.safeParse(query.answer);
  const open =
    invitation.starts_at === meeting.starts_at &&
    meetingCanReceiveResponses(meeting);

  async function submit(form: FormData) {
    "use server";
    const answer = meetingResponseInput.safeParse(form.get("answer"));
    const saved =
      answer.success &&
      (await new MeetingSchedulingRepository().respond(token, answer.data));
    redirect(`/meeting-response/${token}?result=${saved ? "saved" : "closed"}`);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <h1 className="break-words text-2xl font-semibold">{meeting.title}</h1>
      <p className="mt-2 text-muted">
        {formatDateTime(meeting.starts_at, "full")}
      </p>
      {query.result === "saved" && invitation.response ? (
        <p className="mt-4 font-medium text-brand" role="status">
          Dit svar er gemt. {meetingResponseLabel(invitation.response)}.
        </p>
      ) : null}
      {!open || query.result === "closed" ? (
        <p className="mt-4">
          Denne indkaldelse kan ikke længere besvares. Kontakt arrangøren, hvis
          du har brug for at ændre dit svar.
        </p>
      ) : (
        <form action={submit} className="mt-5 space-y-3">
          {preferred.success ? (
            <p>Bekræft dit svar, så arrangøren får besked.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              name="answer"
              value="accepted"
              variant={
                preferred.success && preferred.data === "declined"
                  ? "secondary"
                  : "primary"
              }
            >
              Deltager
            </Button>
            <Button
              type="submit"
              name="answer"
              value="declined"
              variant={
                preferred.success && preferred.data === "declined"
                  ? "primary"
                  : "secondary"
              }
            >
              Deltager ikke
            </Button>
          </div>
          {invitation.response && query.result !== "saved" ? (
            <p className="text-sm text-muted">
              Dit nuværende svar er{" "}
              {meetingResponseLabel(invitation.response).toLowerCase()}.
            </p>
          ) : null}
        </form>
      )}
    </main>
  );
}
