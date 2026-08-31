"use client";

import { useMemo, useState, type FormEvent } from "react";

import { Button, Input, Modal, StatusBadge, Textarea } from "@/components/ui";
import {
  meetingMaterialContentLabels,
  type UnavailableMeetingMaterialParticipant,
} from "@/lib/meeting-material-dispatch";
import type { RelatedDocumentView } from "@/types/documents";
import type {
  MeetingMaterialContentType,
  MeetingMaterialDispatchHistory,
  MeetingTaskListMode,
} from "@/types/meeting-materials";

type RecipientOption = {
  userId: string;
  name: string;
  email: string;
  isMeetingParticipant: boolean;
};

const dateTime = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "long",
  timeStyle: "short",
});

function historyTitle(history: MeetingMaterialDispatchHistory) {
  return history.content_types
    .map((type) => meetingMaterialContentLabels[type])
    .join(", ");
}

export function SendMeetingMaterialsModal({
  organizationId,
  committeeId,
  meetingId,
  meetingTitle,
  meetingDateLabel,
  minutesAvailable,
  recipients,
  participantSummary,
  relatedDocuments,
  initialHistory,
}: {
  organizationId: string;
  committeeId: string;
  meetingId: string;
  meetingTitle: string;
  meetingDateLabel: string;
  minutesAvailable: boolean;
  recipients: RecipientOption[];
  participantSummary: {
    recipientCount: number;
    totalParticipantCount: number;
    participantsWithEmailCount: number;
    unavailableParticipants: UnavailableMeetingMaterialParticipant[];
    usedCommitteeFallback: boolean;
  };
  relatedDocuments: RelatedDocumentView[];
  initialHistory: MeetingMaterialDispatchHistory[];
}) {
  const participantCount = participantSummary.recipientCount;
  const defaultRecipientMode = participantCount > 0 ? "participants" : "selected";
  const [open, setOpen] = useState(false);
  const [contentTypes, setContentTypes] = useState<MeetingMaterialContentType[]>([
    "agenda",
  ]);
  const [taskListMode, setTaskListMode] =
    useState<MeetingTaskListMode>("general");
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [recipientMode, setRecipientMode] = useState<"participants" | "selected">(
    defaultRecipientMode,
  );
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>(
    recipients
      .filter((recipient) => recipient.isMeetingParticipant)
      .map((recipient) => recipient.userId),
  );
  const [subject, setSubject] = useState(`Mødemateriale: ${meetingTitle}`);
  const [message, setMessage] = useState(
    `Her er mødematerialet til ${meetingTitle}.`,
  );
  const [history, setHistory] = useState(initialHistory);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const documents = useMemo(
    () => [
      ...new Map(
        relatedDocuments.map((document) => [document.document.id, document]),
      ).values(),
    ],
    [relatedDocuments],
  );
  const recipientPreviewCount =
    recipientMode === "participants"
      ? participantCount
      : selectedRecipientIds.length;

  function toggleContent(type: MeetingMaterialContentType) {
    setContentTypes((current) =>
      current.includes(type)
        ? current.filter((candidate) => candidate !== type)
        : [...current, type],
    );
  }

  function toggleSelection(
    value: string,
    setter: (value: string[]) => void,
    current: string[],
  ) {
    setter(
      current.includes(value)
        ? current.filter((candidate) => candidate !== value)
        : [...current, value],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          committeeId,
          contentTypes,
          taskListMode: contentTypes.includes("tasks") ? taskListMode : null,
          includeAttachments,
          documentIds: includeAttachments ? selectedDocumentIds : [],
          recipientMode,
          recipientUserIds:
            recipientMode === "selected" ? selectedRecipientIds : [],
          subject,
          message,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        recipientCount?: number;
        failedCount?: number;
        status?: "sent" | "stubbed" | "partial" | "failed" | "skipped_missing_config";
        history?: MeetingMaterialDispatchHistory;
      };
      if (!response.ok) {
        setError(result.error || "Mødematerialet kunne ikke udsendes.");
        return;
      }
      if (result.history) setHistory((current) => [result.history!, ...current]);
      if (result.status === "sent") {
        setStatus(`Mødematerialet blev sendt til ${result.recipientCount ?? 0} modtagere.`);
      } else if (result.status === "stubbed") {
        setStatus(`Udsendelsen blev klargjort i stub-mode til ${result.recipientCount ?? 0} modtagere.`);
      } else if (result.status === "skipped_missing_config") {
        setError("Udsendelsen blev registreret, men email-konfigurationen mangler.");
      } else if (result.status === "partial") {
        setError(`Udsendelsen blev kun delvist leveret. ${result.failedCount ?? 0} leverancer fejlede.`);
      } else {
        setError("Udsendelsen blev registreret, men ingen emails kunne leveres.");
      }
    } catch {
      setError("Forbindelsen til serveren mislykkedes. Prøv igen.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
          setError(null);
          setStatus(null);
        }}
        type="button"
      >
        Udsend
      </Button>
      <Modal
        description="Vælg indhold, bilag og modtagere. Forhåndsvisningen ændrer eller kopierer ingen records."
        maxWidth="3xl"
        onClose={() => setOpen(false)}
        open={open}
        title="Udsend mødemateriale"
      >
        <form className="space-y-6" onSubmit={submit}>
          <section className="space-y-3" aria-labelledby="dispatch-content-heading">
            <div>
              <h3 className="text-sm font-semibold" id="dispatch-content-heading">Indhold</h3>
              <p className="text-xs text-muted">Vælg én eller flere PDF-filer.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["agenda", "tasks", "minutes"] as const).map((type) => {
                const disabled = type === "minutes" && !minutesAvailable;
                return (
                  <label
                    className="flex min-h-12 items-start gap-2 rounded-[var(--radius-control)] border border-line px-3 py-3 text-sm"
                    key={type}
                  >
                    <input
                      checked={contentTypes.includes(type)}
                      disabled={disabled}
                      onChange={() => toggleContent(type)}
                      type="checkbox"
                    />
                    <span>
                      <span className="block font-semibold">{meetingMaterialContentLabels[type]}</span>
                      {disabled ? <span className="block text-xs text-muted">Kan udsendes, når referatet er sendt til godkendelse.</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
            {contentTypes.includes("tasks") ? (
              <fieldset className="rounded-[var(--radius-control)] border border-line p-3">
                <legend className="px-1 text-sm font-semibold">Opgaveliste</legend>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input checked={taskListMode === "general"} onChange={() => setTaskListMode("general")} type="radio" />
                    Generel · samme liste til alle
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input checked={taskListMode === "personal"} onChange={() => setTaskListMode("personal")} type="radio" />
                    Personlig · individuel liste pr. modtager
                  </label>
                </div>
              </fieldset>
            ) : null}
          </section>

          <section className="space-y-3" aria-labelledby="dispatch-documents-heading">
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold" id="dispatch-documents-heading">
              <input checked={includeAttachments} disabled={!documents.length} onChange={(event) => setIncludeAttachments(event.target.checked)} type="checkbox" />
              Medtag bilag {documents.length ? `(${documents.length} tilgængelige)` : "(ingen tilknyttede bilag)"}
            </label>
            {includeAttachments ? (
              <div className="max-h-44 divide-y divide-line overflow-y-auto border-y border-line">
                {documents.map(({ document }) => (
                  <label className="flex min-h-12 min-w-0 items-center gap-2 py-2 text-sm" key={document.id}>
                    <input checked={selectedDocumentIds.includes(document.id)} onChange={() => toggleSelection(document.id, setSelectedDocumentIds, selectedDocumentIds)} type="checkbox" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold" title={document.name}>{document.name}</span>
                      <span className="block truncate text-xs text-muted">{document.currentVersion?.file_name ?? "Ingen filversion"}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-3" aria-labelledby="dispatch-recipients-heading">
            <h3 className="text-sm font-semibold" id="dispatch-recipients-heading">Modtagere</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-12 items-start gap-2 rounded-[var(--radius-control)] border border-line p-3 text-sm">
                <input checked={recipientMode === "participants"} disabled={!participantCount} name="dispatch-recipient-mode" onChange={() => setRecipientMode("participants")} type="radio" />
                <span><span className="block font-semibold">Alle mødedeltagere</span><span className="block text-xs text-muted">{participantSummary.participantsWithEmailCount} af {participantSummary.totalParticipantCount} med email</span></span>
              </label>
              <label className="flex min-h-12 items-start gap-2 rounded-[var(--radius-control)] border border-line p-3 text-sm">
                <input checked={recipientMode === "selected"} name="dispatch-recipient-mode" onChange={() => setRecipientMode("selected")} type="radio" />
                <span><span className="block font-semibold">Udvalgte / andre modtagere</span><span className="block text-xs text-muted">Aktive medlemmer af organisationen</span></span>
              </label>
            </div>
            {participantSummary.usedCommitteeFallback ? (
              <p className="text-xs text-muted">
                Der er ikke registreret konkrete deltagere på mødet. Aktive
                udvalgsmedlemmer bruges som eksisterende fallback.
              </p>
            ) : null}
            {participantSummary.unavailableParticipants.length > 0 ? (
              <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="note">
                <p className="font-semibold">Kan ikke modtage udsendelsen:</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {participantSummary.unavailableParticipants.map((participant) => (
                    <li className="break-words" key={participant.key}>
                      {participant.name} · {participant.reason === "missing_email" ? "mangler email" : "ikke længere aktivt organisationsmedlem"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {recipientMode === "selected" ? (
              <div className="max-h-52 divide-y divide-line overflow-y-auto border-y border-line">
                {recipients.map((recipient) => (
                  <label className="flex min-h-12 min-w-0 items-center gap-2 py-2 text-sm" key={recipient.userId}>
                    <input checked={selectedRecipientIds.includes(recipient.userId)} onChange={() => toggleSelection(recipient.userId, setSelectedRecipientIds, selectedRecipientIds)} type="checkbox" />
                    <span className="min-w-0"><span className="block truncate font-semibold" title={recipient.name}>{recipient.name}</span><span className="block truncate text-xs text-muted">{recipient.email}</span></span>
                  </label>
                ))}
              </div>
            ) : null}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Emne<Input className="mt-1" maxLength={180} onChange={(event) => setSubject(event.target.value)} required value={subject} /></label>
            <label className="text-sm font-medium sm:col-span-2">Kort besked<Textarea className="mt-1" maxLength={2000} onChange={(event) => setMessage(event.target.value)} value={message} /></label>
          </section>

          <section className="rounded-[var(--radius-control)] border border-line bg-subtle/45 p-4" aria-labelledby="dispatch-preview-heading">
            <h3 className="text-sm font-semibold" id="dispatch-preview-heading">Forhåndsvisning</h3>
            <p className="mt-1 text-sm text-muted">{meetingTitle} · {meetingDateLabel}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              <li>{contentTypes.length ? contentTypes.map((type) => meetingMaterialContentLabels[type]).join(", ") : "Intet indhold valgt"}</li>
              {contentTypes.includes("tasks") ? <li>{taskListMode === "personal" ? "Personlig opgaveliste – indholdet varierer pr. modtager" : "Generel opgaveliste – samme indhold til alle"}</li> : null}
              <li>{includeAttachments ? `${selectedDocumentIds.length} valgte bilag` : "Ingen bilag"}</li>
              <li>{recipientPreviewCount} modtagere</li>
            </ul>
          </section>

          {error ? <div className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm" role="alert">{error}</div> : null}
          {status ? <div className="rounded-[var(--radius-control)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{status}</div> : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setOpen(false)} type="button" variant="secondary">Luk</Button>
            <Button disabled={sending || !contentTypes.length || !recipientPreviewCount || !subject.trim()} type="submit">{sending ? "Udsender…" : "Udsend nu"}</Button>
          </div>
        </form>

        <section className="mt-7 border-t border-line pt-5" aria-labelledby="dispatch-history-heading">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold" id="dispatch-history-heading">Udsendelseshistorik</h3>
            <span className="text-xs text-muted">{history.length} registreret</span>
          </div>
          <div className="mt-3 divide-y divide-line border-y border-line">
            {history.map((item) => (
              <article className="py-3" key={item.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{historyTitle(item)} udsendt</p>
                  <StatusBadge tone={item.delivery_status === "sent" ? "success" : item.delivery_status === "failed" ? "danger" : "warning"}>{item.delivery_status === "sent" ? "Sendt" : item.delivery_status === "stubbed" ? "Stub-mode" : item.delivery_status === "partial" ? "Delvist sendt" : item.delivery_status === "skipped_missing_config" ? "Mangler konfiguration" : "Fejlet"}</StatusBadge>
                </div>
                <p className="mt-1 text-xs text-muted">{dateTime.format(new Date(item.sent_at))} · {item.recipient_count} modtagere · {item.senderName}</p>
                <p className="mt-1 text-xs text-muted">{item.task_list_mode === "personal" ? "Personlige opgavelister" : item.task_list_mode === "general" ? "Generel opgaveliste" : "Ingen opgaveliste"} · {item.document_snapshot.length} bilag</p>
              </article>
            ))}
            {!history.length ? <p className="py-4 text-sm text-muted">Der er endnu ingen udsendelser.</p> : null}
          </div>
        </section>
      </Modal>
    </>
  );
}
