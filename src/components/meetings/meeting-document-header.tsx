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
  attendeeCount,
  minutesStatus,
  agendaItemCount,
  transferredItemCount,
  actions,
}: {
  meeting: Meeting;
  committeeName: string;
  attendeeCount: number;
  minutesStatus: MinutesStatus | null;
  agendaItemCount: number;
  transferredItemCount: number;
  actions?: ReactNode;
}) {
  return (
    <header className="meeting-document-header border-b border-line pb-5">
      <div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Møde og referat
          </p>
          <h1 className="mt-1.5 max-w-4xl break-words text-3xl font-semibold leading-tight tracking-[-0.035em]">
            {meeting.title}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {committeeName} · {formatDateTime(meeting.starts_at, "full")}
          </p>
        </div>
      </div>

      {meeting.description ? (
        <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-muted">
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
              tone={minutesStatus ? minutesStatusTones[minutesStatus] : "neutral"}
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
          <dt>Deltagere</dt>
          <dd>{attendeeCount > 0 ? attendeeCount : "Ikke registreret"}</dd>
        </div>
        <div>
          <dt>Dagsordenspunkter</dt>
          <dd>{agendaItemCount}</dd>
        </div>
        <div>
          <dt>Overførte punkter</dt>
          <dd>{transferredItemCount}</dd>
        </div>
      </dl>

      {actions ? (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Mødehandlinger
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {actions}
          </div>
        </div>
      ) : null}
    </header>
  );
}
