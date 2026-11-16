"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { AgendaItemDocumentTitle } from "@/components/agenda-items/agenda-item-document-title";
import { ManualMinutesApprovalButton } from "@/components/meetings/manual-minutes-approval-button";
import { RichTextContent } from "@/components/forms/rich-text-content";
import {
  Button,
  DocumentPanel,
  Modal,
  StatusBadge,
  buttonClassName,
} from "@/components/ui";
import {
  formatDateTime,
  meetingMinutesStatusLabels,
  meetingMinuteApprovalStatusLabels,
} from "@/lib/localization";
import {
  canRecordManualMinutesApproval,
  isManualMinutesApproval,
  isMinutesFullyApproved,
} from "@/lib/previous-minutes-approval";
import { isRichTextEmpty } from "@/lib/rich-text";
import type { PreviousMeetingMinutesReference } from "@/types/domain";

export function PreviousMinutesReference({
  reference,
  root,
  organizationId,
  committeeId,
  userId,
}: {
  reference: PreviousMeetingMinutesReference;
  root: string;
  organizationId: string;
  committeeId: string;
  userId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  const meeting = reference.meeting;
  const minutes = reference.minutes;
  const approved = isMinutesFullyApproved(reference);
  const changes = reference.approvals.filter(
    ({ status }) => status === "change_requested",
  );
  const missing = reference.approvals.filter(
    ({ status }) => status === "pending" || status === "no_response",
  );
  const manual = reference.approvals.filter(isManualMinutesApproval);

  const message = !meeting
    ? "Der findes ikke et tidligere referat at godkende."
    : !minutes
      ? "Der findes endnu ikke et referat fra seneste møde."
      : approved
        ? "Seneste referat er godkendt."
        : "Seneste referat er endnu ikke godkendt.";

  return (
    <>
      <div className="border-t border-line bg-info-soft/55 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Seneste referat</p>
            <p className="mt-1 text-sm text-muted">{message}</p>
          </div>
          {minutes ? (
            <StatusBadge tone={approved ? "success" : "warning"}>
              {approved
                ? "Godkendt"
                : changes.length
                  ? "Ændringer ønskes"
                  : missing.length
                    ? "Afventer godkendelse"
                    : meetingMinutesStatusLabels[minutes.status]}
            </StatusBadge>
          ) : null}
        </div>

        {meeting ? (
          <dl className="mt-4 grid gap-4 border-t border-info/15 pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Seneste møde</dt>
              <dd className="mt-1 font-medium">{meeting.title}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Mødedato</dt>
              <dd className="mt-1">{formatDateTime(meeting.starts_at)}</dd>
            </div>
          </dl>
        ) : null}

        {meeting &&
        minutes &&
        (changes.length > 0 || missing.length > 0 || manual.length > 0) ? (
          <div className="mt-3 divide-y divide-line border-y border-line text-sm">
            {changes.map((approval) => (
              <div className="py-2" key={approval.id}>
                <p className="font-semibold">
                  {approval.memberName} · Ændringer ønskes
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-muted">
                  {approval.comment}
                </p>
              </div>
            ))}
            {missing.map((approval) => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 py-2"
                key={approval.id}
              >
                <div>
                  <p className="font-semibold">{approval.memberName}</p>
                  <p className="text-xs text-muted">
                    {meetingMinuteApprovalStatusLabels[approval.status]}
                  </p>
                </div>
                {reference.canManageApproval &&
                approval.user_id !== userId &&
                canRecordManualMinutesApproval(
                  minutes.status,
                  approval.status,
                ) ? (
                  <ManualMinutesApprovalButton
                    committeeId={committeeId}
                    meetingId={meeting.id}
                    approvalId={approval.id}
                    memberName={approval.memberName}
                    organizationId={organizationId}
                  />
                ) : null}
              </div>
            ))}
            {manual.map((approval) => (
              <p className="py-2 text-xs text-muted" key={approval.id}>
                {approval.memberName} · Manuelt godkendt af{" "}
                {approval.manualApprovedByName}
              </p>
            ))}
          </div>
        ) : null}

        {meeting ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {minutes ? (
              <Button onClick={() => setIsOpen(true)}>Åbn referat</Button>
            ) : null}
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`${root}/meetings/${meeting.id}${minutes && !approved ? "#minutes-approval" : ""}`}
            >
              {minutes && !approved ? "Åbn referatgodkendelse" : "Gå til møde"}
            </Link>
          </div>
        ) : null}
      </div>

      {meeting && minutes ? (
        <Modal
          description={`${formatDateTime(meeting.starts_at)} · ${
            meetingMinutesStatusLabels[minutes.status]
          }`}
          eyebrow="Seneste referat"
          maxWidth="3xl"
          onClose={close}
          open={isOpen}
          title={meeting.title}
        >
          <DocumentPanel className="minutes-document space-y-9 border-0 p-0 shadow-none">
            <section className="minutes-document-section">
              <p className="minutes-document-label">Referat</p>
              <RichTextContent
                className="mt-3 text-base leading-8"
                emptyText="Der er ingen referattekst."
                value={minutes.minutes_text}
              />
            </section>
            <section className="minutes-decision">
              <p className="minutes-document-label text-success">
                Samlede beslutninger
              </p>
              <RichTextContent
                className="mt-3 text-sm leading-7"
                emptyText="Der er ingen samlede beslutninger."
                value={minutes.decisions}
              />
            </section>

            {reference.agendaItemMinutes.length > 0 ? (
              <section className="minutes-document-section">
                <p className="minutes-document-label">Punktreferater</p>
                <div className="mt-4 divide-y divide-line border-y border-line">
                  {reference.agendaItemMinutes.map((item, index) => (
                    <article className="py-6" key={item.id}>
                      <h3 className="text-lg font-semibold">
                        {index + 1}.{" "}
                        <AgendaItemDocumentTitle
                          title={item.title}
                          type={item.itemType}
                        />
                      </h3>
                      {!isRichTextEmpty(item.notes) ? (
                        <div className="mt-4">
                          <p className="minutes-document-label">Noter</p>
                          <RichTextContent
                            className="mt-2 text-sm leading-7"
                            value={item.notes}
                          />
                        </div>
                      ) : null}
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {!isRichTextEmpty(item.decision) ? (
                          <div className="minutes-decision">
                            <p className="minutes-document-label text-success">
                              Beslutning
                            </p>
                            <RichTextContent
                              className="mt-2 text-sm leading-7"
                              value={item.decision}
                            />
                          </div>
                        ) : null}
                        {!isRichTextEmpty(item.followUp) ? (
                          <div className="minutes-follow-up">
                            <p className="minutes-document-label text-warning">
                              Opfølgning
                            </p>
                            <RichTextContent
                              className="mt-2 text-sm leading-7"
                              value={item.followUp}
                            />
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </DocumentPanel>
        </Modal>
      ) : null}
    </>
  );
}
