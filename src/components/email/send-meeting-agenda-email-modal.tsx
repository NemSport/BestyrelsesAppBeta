"use client";

import { useState, type FormEvent } from "react";

import { Button, Input, Modal, Textarea } from "@/components/ui";

type Recipient = {
  userId: string;
  name: string;
  email: string;
};

export function SendMeetingAgendaEmailModal({
  organizationId,
  committeeId,
  meetingId,
  meetingTitle,
  meetingDateLabel,
  agendaItemCount,
  recipients,
}: {
  organizationId: string;
  committeeId: string;
  meetingId: string;
  meetingTitle: string;
  meetingDateLabel: string;
  agendaItemCount: number;
  recipients: Recipient[];
}) {
  const [open, setOpen] = useState(false);
  const [includeCommittee, setIncludeCommittee] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    recipients.map((recipient) => recipient.userId),
  );
  const [subject, setSubject] = useState(`Dagsorden: ${meetingTitle}`);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function toggleRecipient(userId: string) {
    setIncludeCommittee(false);
    setSelectedIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/email/agenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          committeeId,
          meetingId,
          subject,
          message,
          recipients: {
            includeCommittee,
            memberUserIds: includeCommittee ? [] : selectedIds,
          },
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        recipientCount?: number;
        mode?: "stub" | "resend";
      };
      if (!response.ok) {
        setError(result.error || "Emailen kunne ikke sendes.");
        return;
      }
      setStatus(
        result.mode === "stub"
          ? `Emailen blev klargjort i stub-mode til ${result.recipientCount ?? 0} modtagere.`
          : `Emailen blev sendt til ${result.recipientCount ?? 0} modtagere.`,
      );
    } catch {
      setError(
        "Forbindelsen til serveren mislykkedes. Kontrollér forbindelsen, og prøv igen.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        className="block w-full rounded-[var(--radius-control)] px-3 py-2 text-left text-sm font-semibold text-ink transition hover:bg-subtle"
        onClick={() => {
          setOpen(true);
          setStatus(null);
          setError(null);
        }}
        type="button"
      >
        Send dagsorden pr. email
      </button>
      <Modal
        description="Vælg modtagere, gennemgå emne og send dagsordenen manuelt."
        maxWidth="2xl"
        onClose={() => setOpen(false)}
        open={open}
        title="Send pr. email"
      >
        <form className="space-y-5" onSubmit={submit}>
          {error ? (
            <div className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}
          {status ? (
            <div className="rounded-[var(--radius-control)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {status}
            </div>
          ) : null}

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-ink">Modtagere</h3>
                <p className="text-xs text-muted">
                  Kun aktive medlemmer af udvalget kan vælges.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink">
                <input
                  checked={includeCommittee}
                  onChange={(event) => {
                    setIncludeCommittee(event.target.checked);
                    if (event.target.checked) {
                      setSelectedIds(recipients.map((recipient) => recipient.userId));
                    }
                  }}
                  type="checkbox"
                />
                Hele udvalget
              </label>
            </div>
            <div className="max-h-48 space-y-1 overflow-auto border-y border-line py-2">
              {recipients.length > 0 ? (
                recipients.map((recipient) => (
                  <label
                    className="flex items-start gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-sm hover:bg-subtle"
                    key={recipient.userId}
                  >
                    <input
                      checked={includeCommittee || selectedIds.includes(recipient.userId)}
                      disabled={includeCommittee}
                      onChange={() => toggleRecipient(recipient.userId)}
                      type="checkbox"
                    />
                    <span>
                      <span className="block font-semibold text-ink">
                        {recipient.name}
                      </span>
                      <span className="block text-xs text-muted">
                        {recipient.email}
                      </span>
                    </span>
                  </label>
                ))
              ) : (
                <p className="px-2 py-3 text-sm text-muted">
                  Der er ingen aktive medlemmer i udvalget.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <label className="label" htmlFor="agenda-email-subject">
                Emne
              </label>
              <Input
                id="agenda-email-subject"
                onChange={(event) => setSubject(event.target.value)}
                value={subject}
              />
            </div>
            <div>
              <label className="label" htmlFor="agenda-email-message">
                Kort besked
              </label>
              <Textarea
                id="agenda-email-message"
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Tilføj eventuelt en kort besked til modtagerne."
                value={message}
              />
            </div>
          </section>

          <section className="rounded-[var(--radius-control)] border border-line bg-subtle/45 p-3 text-sm">
            <p className="font-semibold text-ink">Preview</p>
            <p className="mt-1 text-muted">
              {meetingTitle} · {meetingDateLabel}
            </p>
            <p className="mt-1 text-muted">
              {agendaItemCount} dagsordenspunkter sendes sammen med link til
              mødet. Interne noter sendes ikke.
            </p>
          </section>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={() => setOpen(false)}
              size="sm"
              type="button"
              variant="secondary"
            >
              Annuller
            </Button>
            <Button
              disabled={
                sending ||
                recipients.length === 0 ||
                (!includeCommittee && selectedIds.length === 0)
              }
              size="sm"
              type="submit"
            >
              {sending ? "Sender..." : "Send email"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
