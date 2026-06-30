"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  Button,
  EmptyState,
  Input,
  StatusBadge,
  Textarea,
  buttonClassName,
  type StatusTone,
} from "@/components/ui";
import {
  formatDate,
  formatDateTime,
  meetingMinuteApprovalStatusLabels,
} from "@/lib/localization";
import type {
  MeetingMinuteApprovalView,
  MeetingMinutes,
  MinuteAttachmentView,
} from "@/types/domain";

const approvalStatusTones: Record<
  MeetingMinuteApprovalView["status"],
  StatusTone
> = {
  pending: "warning",
  approved: "success",
  change_requested: "danger",
  no_response: "neutral",
};

async function readResponse<T>(response: Response) {
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Handlingen mislykkedes.");
  return result;
}

export function MinuteAttachments({
  organizationId,
  committeeId,
  meetingId,
  agendaItemId = null,
  attachments,
  canEdit,
}: {
  organizationId: string;
  committeeId: string;
  meetingId: string;
  agendaItemId?: string | null;
  attachments: MinuteAttachmentView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) {
      setError("Vælg en fil, der skal vedhæftes.");
      return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("committeeId", committeeId);
      if (agendaItemId) formData.set("agendaItemId", agendaItemId);
      formData.set("file", file);
      const result = await readResponse<{ message: string }>(
        await fetch(`/api/meetings/${meetingId}/minutes/attachments`, {
          method: "POST",
          body: formData,
        }),
      );
      setFile(null);
      setMessage(result.message);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Filen kunne ikke vedhæftes.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(attachment: MinuteAttachmentView) {
    const confirmed = window.confirm(
      `Er du sikker på, at du vil fjerne bilaget "${attachment.fileName}"? Det fjernes også fra kommende PDF-eksporter.`,
    );
    if (!confirmed) return;

    setRemovingId(attachment.id);
    setError(null);
    setMessage(null);
    try {
      const result = await readResponse<{ message: string }>(
        await fetch(`/api/minutes-attachments/${attachment.id}/download`, {
          method: "DELETE",
        }),
      );
      setMessage(result.message);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Bilaget kunne ikke fjernes.",
      );
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <details className="group rounded-[var(--radius-control)] border border-line bg-surface">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <div>
          <h4 className="text-sm font-semibold">Vedhæftninger</h4>
          <p className="mt-0.5 text-xs text-muted">
            {attachments.length === 0
              ? "Ingen vedhæftninger"
              : `${attachments.length} ${
                  attachments.length === 1 ? "fil" : "filer"
                }`}
          </p>
        </div>
        <span className="text-xs font-semibold text-brand">
          <span className="group-open:hidden">Åbn vedhæftninger</span>
          <span className="hidden group-open:inline">Skjul vedhæftninger</span>
        </span>
      </summary>
      <div className="border-t border-line p-3">
        <section>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="hidden">
              <h4 className="font-semibold">Vedhæftninger</h4>
              <p className="mt-1 text-xs text-slate-500">
                Dokumenter gemmes sikkert og kan åbnes af medlemmer med adgang
                til referatet.
              </p>
            </div>
            {canEdit ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="button-secondary cursor-pointer">
                  <span>Vedhæft fil</span>
                  <input
                    className="sr-only"
                    onChange={(event) => {
                      setFile(event.target.files?.[0] ?? null);
                      setError(null);
                    }}
                    type="file"
                  />
                </label>
                {file ? (
                  <Button disabled={uploading} onClick={upload} type="button">
                    {uploading ? "Uploader..." : "Upload"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          {file ? (
            <p className="mt-2 text-xs text-slate-600">
              Valgt fil: <span className="font-medium">{file.name}</span>
            </p>
          ) : null}
          {message ? (
            <p className="mt-2 text-sm text-emerald-700" role="status">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-4 space-y-2">
            {attachments.map((attachment) => (
              <article
                className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-1 py-3 first:border-t-0"
                key={attachment.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {attachment.fileName}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {attachment.mimeType} · Uploadet af{" "}
                    {attachment.uploadedByName} ·{" "}
                    {formatDateTime(attachment.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a
                    className={buttonClassName({
                      size: "sm",
                      variant: "secondary",
                    })}
                    href={`/api/minutes-attachments/${attachment.id}/download`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Åbn
                  </a>
                  <a
                    className={buttonClassName({
                      size: "sm",
                      variant: "secondary",
                    })}
                    href={`/api/minutes-attachments/${attachment.id}/download?download=1`}
                  >
                    Download
                  </a>
                  {canEdit ? (
                    <Button
                      disabled={removingId === attachment.id}
                      onClick={() => removeAttachment(attachment)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {removingId === attachment.id ? "Fjerner..." : "Fjern"}
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
            {attachments.length === 0 ? (
              <EmptyState compact title="Der er endnu ingen vedhæftninger." />
            ) : null}
          </div>
        </section>
      </div>
    </details>
  );
}

export function MinutesApprovalPanel({
  organizationId,
  committeeId,
  meetingId,
  userId,
  minutes,
  approvals,
  approvalRecipientInfo,
  canEdit,
  canApprove,
  className,
}: {
  organizationId: string;
  committeeId: string;
  meetingId: string;
  userId: string;
  minutes: MeetingMinutes | null;
  approvals: MeetingMinuteApprovalView[];
  approvalRecipientInfo: {
    mode: "participants" | "fallback";
    eligibleCount: number;
    fallbackMemberCount: number;
    registeredInternalCount: number;
    externalCount: number;
  };
  canEdit: boolean;
  canApprove: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [deadline, setDeadline] = useState(minutes?.approval_deadline ?? "");
  const [comment, setComment] = useState("");
  const [showChangeRequest, setShowChangeRequest] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [working, setWorking] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ownApproval = approvals.find((approval) => approval.user_id === userId);
  const deadlineExpired =
    Boolean(minutes?.approval_deadline) &&
    new Date(`${minutes!.approval_deadline}T23:59:59`) < new Date();
  const counts = useMemo(
    () =>
      approvals.reduce(
        (result, approval) => {
          result[approval.status] += 1;
          return result;
        },
        { pending: 0, approved: 0, change_requested: 0, no_response: 0 },
      ),
    [approvals],
  );

  useEffect(() => {
    setDeadline(minutes?.approval_deadline ?? "");
  }, [minutes?.approval_deadline]);

  async function act(body: Record<string, unknown>) {
    setWorking(true);
    setError(null);
    setMessage(null);
    const isSendApprovalAction = body.action === "send";
    const requestBody = {
      organizationId,
      committeeId,
      ...body,
    };
    if (isSendApprovalAction) {
      console.info("[minutes-approval] Send til godkendelse klik", {
        organizationId,
        committeeId,
        meetingId,
        registeredParticipantsCount:
          approvalRecipientInfo.registeredInternalCount +
          approvalRecipientInfo.externalCount,
        presentInternalCount:
          approvalRecipientInfo.mode === "participants"
            ? approvalRecipientInfo.eligibleCount
            : 0,
        fallbackMemberCount: approvalRecipientInfo.fallbackMemberCount,
        finalRecipientCount: approvalRecipientInfo.eligibleCount,
      });
    }
    let responseStatus: number | null = null;
    try {
      const response = await fetch(`/api/meetings/${meetingId}/minutes/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      responseStatus = response.status;
      const result = await readResponse<{ message: string }>(response);
      if (isSendApprovalAction) {
        console.info("[minutes-approval] Send til godkendelse API response", {
          organizationId,
          committeeId,
          meetingId,
          status: response.status,
          ok: response.ok,
          message: result.message,
        });
      }
      setMessage(result.message);
      setComment("");
      setShowChangeRequest(false);
      router.refresh();
    } catch (caughtError) {
      if (isSendApprovalAction) {
        console.warn("[minutes-approval] Send til godkendelse API fejl", {
          organizationId,
          committeeId,
          meetingId,
          status: responseStatus,
          error:
            caughtError instanceof Error
              ? caughtError.message
              : "Ukendt fejl",
        });
      }
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Godkendelseshandlingen mislykkedes.",
      );
    } finally {
      setWorking(false);
    }
  }

  function sendForApproval() {
    if (approvalRecipientInfo.eligibleCount <= 0) {
      setShowDetails(true);
      setMessage(null);
      setError(
        "Ingen interne deltagere markeret som til stede, og ingen aktive udvalgsmedlemmer fundet.",
      );
      return;
    }
    void act({ action: "send", deadline });
  }

  async function downloadPdf() {
    setError(null);
    setMessage(null);
    if (
      !minutes ||
      !["approved", "ready_for_approval"].includes(minutes.status)
    ) {
      setShowDetails(true);
      setError(
        "Referatet kan f\u00f8rst downloades som PDF, n\u00e5r det er sendt til godkendelse.",
      );
      return;
    }

    setDownloadingPdf(true);
    try {
      const response = await fetch(
        `/api/meetings/${meetingId}/minutes/pdf?organizationId=${organizationId}&committeeId=${committeeId}`,
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
          code?: string;
        } | null;
        throw new Error(
          result?.code === "MINUTES_NOT_APPROVED" ||
            result?.code === "MINUTES_NOT_READY_FOR_PDF"
            ? "Referatet kan f\u00f8rst downloades som PDF, n\u00e5r det er sendt til godkendelse."
            : result?.error ||
                "PDF-filen kunne ikke downloades. Pr\u00f8v igen.",
        );
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      const fileName =
        disposition?.match(/filename="([^"]+)"/i)?.[1] ?? "referat.pdf";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caughtError) {
      setShowDetails(true);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "PDF-filen kunne ikke downloades. Pr\u00f8v igen.",
      );
    } finally {
      setDownloadingPdf(false);
    }
  }

  const approvalSummary =
    minutes?.status === "approved"
      ? "Referatet er godkendt"
      : approvals.length > 0
        ? `${counts.approved} af ${approvals.length} har godkendt`
        : "Referatet er endnu ikke sendt til godkendelse";
  const approvalStatusLabel =
    !minutes || minutes.status === "draft"
      ? "Kladde"
      : minutes.status === "approved"
        ? "Godkendt"
        : counts.approved > 0 ||
            counts.change_requested > 0 ||
            counts.no_response > 0
          ? "Delvist godkendt"
          : "Sendt til godkendelse";
  const missingApprovals = approvals.filter(
    (approval) => approval.status === "pending",
  );
  const hasApprovalRound =
    minutes?.status === "ready_for_approval" || minutes?.status === "approved";
  const canSendForApproval =
    canEdit && Boolean(minutes) && approvalRecipientInfo.eligibleCount > 0;
  const canStartApproval = canEdit;
  const approvalRecipientHelp =
    approvalRecipientInfo.mode === "participants"
      ? approvalRecipientInfo.eligibleCount > 0
        ? `Sendes til ${approvalRecipientInfo.eligibleCount} interne deltagere markeret som til stede.`
        : "Ingen interne deltagere er markeret som til stede. Registrer deltagere før referatet sendes til godkendelse."
      : approvalRecipientInfo.eligibleCount > 0
        ? `Ingen deltagere er registreret endnu. Ved afsendelse bruges fallback til ${approvalRecipientInfo.eligibleCount} aktive udvalgsmedlemmer.`
        : "Der findes ingen mulige godkendere. Registrer deltagere eller opdater udvalgets medlemmer.";

  return (
    <section
      id="minutes-approval"
      className={`overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-sm ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Godkendelse</p>
          <p className="mt-1">
            <StatusBadge
              tone={
                approvalStatusLabel === "Godkendt"
                  ? "success"
                  : approvalStatusLabel === "Kladde"
                    ? "neutral"
                    : "warning"
              }
            >
              {approvalStatusLabel}
            </StatusBadge>
          </p>
          <p className="mt-0.5 text-xs text-muted sm:text-sm">
            {approvalSummary}
            {minutes?.approval_deadline
              ? ` · Frist ${formatDate(minutes.approval_deadline)}`
              : ""}
          </p>
          {hasApprovalRound && approvals.length > 0 ? (
            <p className="mt-0.5 text-xs text-muted">
              {counts.pending} afventer · {counts.change_requested} ændringer
              ønskes
            </p>
          ) : null}
          {hasApprovalRound && missingApprovals.length > 0 ? (
            <p className="mt-0.5 text-xs text-muted">
              Mangler:{" "}
              {missingApprovals
                .map((approval) => approval.memberName)
                .join(", ")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-right">
            <p className="hidden text-xs text-muted sm:block">
              {minutes?.status === "approved"
                ? "Godkendt referat kan downloades som PDF"
                : minutes?.status === "ready_for_approval"
                  ? "Forel\u00f8bigt referat kan downloades som PDF"
                  : "PDF kan downloades n\u00e5r referatet er sendt til godkendelse"}
            </p>
            <Button
              disabled={downloadingPdf}
              onClick={downloadPdf}
              size="sm"
              type="button"
              variant="secondary"
            >
              {downloadingPdf ? "Henter PDF..." : "Download PDF"}
            </Button>
          </div>
          <Button
            aria-expanded={showDetails}
            onClick={() => setShowDetails((visible) => !visible)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {showDetails ? "Skjul detaljer" : "Åbn detaljer"}
          </Button>
        </div>
      </div>
      {!hasApprovalRound && canStartApproval ? (
        <div className="border-t border-line bg-subtle/25 px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label" htmlFor="approval-deadline-primary">
                Godkendelsesfrist
              </label>
              <Input
                id="approval-deadline-primary"
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setDeadline(event.target.value)}
                type="date"
                value={deadline}
              />
            </div>
            <div className="min-w-[220px] flex-1">
              <p
                className={`text-sm ${
                  approvalRecipientInfo.eligibleCount > 0
                    ? "text-muted"
                    : "text-warning"
                }`}
              >
                {approvalRecipientHelp}
                {approvalRecipientInfo.externalCount > 0
                  ? " Eksterne deltagere f\u00e5r ikke godkendelsesopgaver automatisk."
                  : ""}
              </p>
            </div>
            <Button
              disabled={working || !deadline}
              onClick={sendForApproval}
              type="button"
            >
              Send til godkendelse
            </Button>
          </div>
        </div>
      ) : null}
      <div
        className="border-t border-line px-3 pb-3 sm:px-4 sm:pb-4"
        hidden={!showDetails}
      >
        <div className="hidden">
          <div>
            <p className="page-eyebrow">Godkendelsesstatus</p>
            <h3 className="section-title mt-1">Referatgodkendelse</h3>
            {minutes?.approval_deadline ? (
              <p className="mt-2 text-sm text-slate-600">
                Godkendelsesfrist: {formatDate(minutes.approval_deadline)}
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                Referatet er endnu ikke sendt til godkendelse.
              </p>
            )}
          </div>
          <Button disabled={downloadingPdf} onClick={downloadPdf} type="button">
            {downloadingPdf ? "Henter PDF..." : "Download PDF"}
          </Button>
        </div>

        {approvals.length > 0 ? (
          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-control)] border border-line bg-line sm:grid-cols-4">
            <div className="bg-surface px-3 py-2.5">
              <dt className="text-xs text-muted">Afventer</dt>
              <dd className="mt-0.5 text-lg font-semibold">{counts.pending}</dd>
            </div>
            <div className="bg-surface px-3 py-2.5">
              <dt className="text-xs text-muted">Godkendt</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {counts.approved}
              </dd>
            </div>
            <div className="bg-surface px-3 py-2.5">
              <dt className="text-xs text-muted">Ændringer ønskes</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {counts.change_requested}
              </dd>
            </div>
            <div className="bg-surface px-3 py-2.5">
              <dt className="text-xs text-muted">Ingen respons</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {counts.no_response}
              </dd>
            </div>
          </dl>
        ) : null}

        {message ? (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p
            className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {canEdit && minutes && hasApprovalRound ? (
          <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-5">
            <div>
              <label className="label" htmlFor="approval-deadline">
                Godkendelsesfrist
              </label>
              <Input
                id="approval-deadline"
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setDeadline(event.target.value)}
                type="date"
                value={deadline}
              />
            </div>
            <p
              className={`max-w-xl text-sm ${
                approvalRecipientInfo.eligibleCount > 0
                  ? "text-muted"
                  : "text-warning"
              }`}
            >
              {approvalRecipientHelp}
              {approvalRecipientInfo.externalCount > 0
                ? " Eksterne deltagere får ikke godkendelsesopgaver automatisk."
                : ""}
            </p>
            <Button
              disabled={working || !deadline || !canSendForApproval}
              onClick={sendForApproval}
              type="button"
            >
              Send til godkendelse
            </Button>
            {deadlineExpired && counts.pending > 0 ? (
              <Button
                disabled={working}
                onClick={() => act({ action: "mark_no_response" })}
                type="button"
                variant="secondary"
              >
                Markér manglende svar som ingen respons
              </Button>
            ) : null}
          </div>
        ) : null}

        {canApprove && ownApproval ? (
          <div className="mt-5 rounded-[var(--radius-control)] border border-accent/25 bg-mist/60 p-4">
            <p className="font-semibold">Dit svar</p>
            <p className="mt-1 text-sm text-slate-600">
              Nuværende status:{" "}
              {meetingMinuteApprovalStatusLabels[ownApproval.status]}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={working}
                onClick={() => act({ action: "respond", status: "approved" })}
                type="button"
              >
                Godkend referat
              </Button>
              <Button
                disabled={working}
                onClick={() => setShowChangeRequest((visible) => !visible)}
                type="button"
                variant="secondary"
              >
                Anmod om ændringer
              </Button>
            </div>
            {showChangeRequest ? (
              <div className="mt-4">
                <label className="label" htmlFor="approval-comment">
                  Begrundelse for ændringer
                </label>
                <Textarea
                  id="approval-comment"
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Beskriv hvilke ændringer der ønskes..."
                  value={comment}
                />
                <Button
                  className="mt-3"
                  disabled={working || !comment.trim()}
                  onClick={() =>
                    act({
                      action: "respond",
                      status: "change_requested",
                      comment,
                    })
                  }
                  type="button"
                >
                  Send ændringsønske
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 divide-y divide-line border-y border-line">
          {hasApprovalRound && approvals.map((approval) => (
            <article className="py-4" key={approval.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{approval.memberName}</p>
                  <p className="text-xs text-slate-500">
                    {approval.memberEmail}
                  </p>
                </div>
                <StatusBadge tone={approvalStatusTones[approval.status]}>
                  {meetingMinuteApprovalStatusLabels[approval.status]}
                </StatusBadge>
              </div>
              {approval.comment ? (
                <div className="mt-3 rounded-lg border-l-4 border-warning/40 bg-warning-soft p-3 text-sm text-warning">
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    Kommentar
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{approval.comment}</p>
                </div>
              ) : null}
            </article>
          ))}
          {!hasApprovalRound ? (
            <EmptyState
              compact
              title="Referatet er ikke sendt til godkendelse endnu."
            />
          ) : approvals.length === 0 ? (
            <EmptyState
              compact
              title="Der er ikke oprettet godkendelsesmodtagere."
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
