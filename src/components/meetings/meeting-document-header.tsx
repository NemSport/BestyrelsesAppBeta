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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function MeetingDocumentHeader({
  meeting,
  committeeName,
  minutesStatus,
  agendaItemCount,
  transferredItemCount,
  participantSummary,
  backLink,
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
    names?: string[];
    action?: ReactNode;
  };
  backLink?: ReactNode;
  actions?: ReactNode;
}) {
  const participantCountLabel =
    participantSummary && participantSummary.registeredCount > 0
      ? `${participantSummary.registeredCount} deltagere registreret`
      : "Ikke registreret";
  const participantNames = participantSummary?.names ?? [];
  const visibleParticipantNames = participantNames.slice(0, 5);
  const hiddenParticipantCount = Math.max(
    0,
    participantNames.length - visibleParticipantNames.length,
  );

  return (
    <header className="meeting-document-header">
      <div className="grid gap-1.5 xl:grid-cols-[minmax(0,3fr)_minmax(30rem,2fr)] xl:items-center xl:gap-x-4">
        <div className="min-w-0">
          {backLink ? <div className="mb-0.5">{backLink}</div> : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="max-w-4xl break-words text-xl font-bold leading-7 text-ink sm:text-2xl">
              {meeting.title}
            </h1>
            <StatusBadge tone={meetingStatusTones[meeting.status]}>
              {meetingStatusLabels[meeting.status]}
            </StatusBadge>
            <StatusBadge
              tone={
                minutesStatus ? minutesStatusTones[minutesStatus] : "neutral"
              }
            >
              {minutesStatus
                ? meetingMinutesStatusLabels[minutesStatus]
                : "Ikke påbegyndt"}
            </StatusBadge>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted xl:inline-flex xl:align-middle">
            <span className="font-medium text-ink">{committeeName}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDateTime(meeting.starts_at, "full")}</span>
            {meeting.location ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{meeting.location}</span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>{agendaItemCount} punkter</span>
            {transferredItemCount > 0 ? (
              <span>· {transferredItemCount} overført</span>
            ) : null}
            {meeting.description ? (
              <details className="group relative">
                <summary className="cursor-pointer list-none font-medium text-brand hover:underline [&::-webkit-details-marker]:hidden">
                  Beskrivelse
                </summary>
                <p className="absolute left-0 z-30 mt-1 w-[min(28rem,calc(100vw-2rem))] whitespace-pre-wrap rounded-[var(--radius-panel)] border border-line bg-surface p-3 text-sm leading-5 text-ink shadow-dialog">
                  {meeting.description}
                </p>
              </details>
            ) : null}
          </div>
          {participantSummary ? (
            <div
              className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 xl:ml-2 xl:inline-flex xl:align-middle"
              id="meeting-participants-heading"
              tabIndex={-1}
            >
              {visibleParticipantNames.map((name, index) => (
                <span
                  aria-label={name}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-brand/15 bg-brand-soft text-[0.68rem] font-bold text-brand shadow-sm"
                  key={`${name}-${index}`}
                  title={name}
                >
                  {initials(name)}
                </span>
              ))}
              {hiddenParticipantCount > 0 ? (
                <span
                  aria-label={`${hiddenParticipantCount} yderligere deltagere`}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-subtle text-[0.68rem] font-bold text-muted"
                  title={`${hiddenParticipantCount} yderligere deltagere`}
                >
                  +{hiddenParticipantCount}
                </span>
              ) : null}
              <span className="text-xs text-muted">
                {participantCountLabel}
              </span>
              {participantSummary.action}
            </div>
          ) : null}
        </div>
        <div className="meeting-header-action-zone flex min-w-0 flex-wrap items-center gap-1.5 xl:justify-self-stretch">
          <div
            className="hidden shrink-0 xl:flex"
            id="meeting-header-mode-slot"
          />
          {actions ? <div className="action-cluster">{actions}</div> : null}
        </div>
      </div>
    </header>
  );
}
