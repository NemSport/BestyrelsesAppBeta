import type { ReactNode } from "react";

import { StatusBadge, type StatusTone } from "@/components/ui";
import {
  formatDateTime,
  meetingMinutesStatusLabels,
  meetingStatusLabels,
} from "@/lib/localization";
import type { Database } from "@/types/database";
import type { Meeting } from "@/types/domain";

type MeetingStatus = Database["public"]["Enums"]["meeting_status"];
type MinutesStatus = Database["public"]["Enums"]["meeting_minutes_status"];

const meetingStatusTones: Record<MeetingStatus, StatusTone> = {
  draft: "neutral",
  scheduled: "info",
  in_progress: "progress",
  completed: "success",
  cancelled: "danger",
};

const minutesStatusTones: Record<MinutesStatus, StatusTone> = {
  draft: "neutral",
  ready_for_approval: "warning",
  approved: "success",
};

export function MeetingDocumentHeader({
  meeting,
  committeeName,
  minutesStatus,
  agendaItemCount,
  transferredItemCount,
  participantSummary,
  actions,
}: {
  meeting: Meeting;
  committeeName: string;
  minutesStatus: MinutesStatus | null;
  agendaItemCount: number;
  transferredItemCount: number;
  participantSummary?: {
    registeredCount: number;
    presentInternalCount: number;
    externalCount: number;
    action?: ReactNode;
  };
  actions?: ReactNode;
}) {
  const participantCountLabel =
    participantSummary && participantSummary.registeredCount > 0
      ? `${participantSummary.registeredCount} deltagere registreret`
      : "Ikke registreret";

  return (
    <header className="meeting-document-header border-b border-line pb-5">
      <div className="entity-header">
        <div className="min-w-0 flex-1">
          <p className="page-eyebrow text-muted">Møde og referat</p>
          <h1 className="page-title max-w-4xl break-words">{meeting.title}</h1>
          <p className="metadata mt-1.5">
            {committeeName} · {formatDateTime(meeting.starts_at, "full")}
          </p>
        </div>
      </div>

      {meeting.description ? (
        <p className="supporting-text mt-3 whitespace-pre-wrap">
          {meeting.description}
        </p>
      ) : null}

      <dl className="meeting-metadata-grid">
        <div>
          <dt>Mødestatus</dt>
          <dd>
            <StatusBadge tone={meetingStatusTones[meeting.status]}>
              {meetingStatusLabels[meeting.status]}
            </StatusBadge>
          </dd>
        </div>
        <div>
          <dt>Referatstatus</dt>
          <dd>
            <StatusBadge
              tone={
                minutesStatus ? minutesStatusTones[minutesStatus] : "neutral"
              }
            >
              {minutesStatus
                ? meetingMinutesStatusLabels[minutesStatus]
                : "Ikke påbegyndt"}
            </StatusBadge>
          </dd>
        </div>
        <div>
          <dt>Sted</dt>
          <dd>{meeting.location || "Ikke angivet"}</dd>
        </div>
        <div>
          <dt>Dagsordenspunkter</dt>
          <dd>{agendaItemCount}</dd>
        </div>
        <div>
          <dt>Overførte punkter</dt>
          <dd>{transferredItemCount}</dd>
        </div>
        <div>
          <dt
            className="scroll-mt-24"
            id="meeting-participants-heading"
            tabIndex={-1}
          >
            Deltagere
          </dt>
          <dd className="space-y-1">
            <span className="block">{participantCountLabel}</span>
            {participantSummary ? (
              <span className="flex flex-wrap items-center gap-2 text-xs font-normal text-muted">
                <StatusBadge
                  tone={
                    participantSummary.presentInternalCount > 0
                      ? "success"
                      : "neutral"
                  }
                >
                  {participantSummary.presentInternalCount} interne til stede
                </StatusBadge>
                {participantSummary.externalCount > 0 ? (
                  <StatusBadge>
                    {participantSummary.externalCount} eksterne
                  </StatusBadge>
                ) : null}
                {participantSummary.action}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      {actions ? (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Mødehandlinger
          </p>
          <div className="action-cluster mt-2">{actions}</div>
        </div>
      ) : null}
    </header>
  );
}
