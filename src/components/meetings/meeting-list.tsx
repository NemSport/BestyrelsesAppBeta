import Link from "next/link";

import { MeetingAgendaPreview } from "@/components/meetings/meeting-agenda-preview";
import {
  StatusBadge,
  buttonClassName,
  primarySurfaceLinkClassName,
  staticSurfaceClassName,
  type StatusTone,
} from "@/components/ui";
import { formatDateTime, meetingStatusLabels } from "@/lib/localization";
import {
  getMeetingListAction,
  getMeetingListPeriod,
} from "@/lib/meeting-list";
import type { MeetingCapabilities } from "@/lib/meeting-capabilities";
import type { MeetingWithAgendaPreview } from "@/types/domain";

export type MeetingListEntry = MeetingWithAgendaPreview & {
  committeeName: string;
  capabilities: MeetingCapabilities;
};

const meetingStatusTones = {
  draft: "neutral",
  scheduled: "info",
  in_progress: "progress",
  completed: "success",
  cancelled: "danger",
} as const satisfies Record<MeetingWithAgendaPreview["status"], StatusTone>;

function actionHref(
  meetingHref: string,
  destination: ReturnType<typeof getMeetingListAction>["destination"],
) {
  if (destination === "edit") return `${meetingHref}/edit`;
  if (destination === "minutes") {
    return `${meetingHref}#general-minutes-heading`;
  }
  return meetingHref;
}

export function MeetingListRow({
  meeting,
  now,
  organizationId,
  showCommittee = true,
}: {
  meeting: MeetingListEntry;
  now: number;
  organizationId: string;
  showCommittee?: boolean;
}) {
  const meetingHref = `/organizations/${organizationId}/committees/${meeting.committee_id}/meetings/${meeting.id}`;
  const action = getMeetingListAction(meeting.status, meeting.capabilities);
  const agendaCount = meeting.agenda_item_occurrences.length;
  const period = getMeetingListPeriod(meeting, now);
  const timingLabel =
    period === "upcoming"
      ? meeting.status === "in_progress"
        ? "Igangværende"
        : "Kommende"
      : period === "cancelled"
        ? "Aflyst"
        : "Afholdt";

  return (
    <article
      className={staticSurfaceClassName(
        "border-l-4 border-l-brand/55 px-3 py-3 sm:px-4",
      )}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={meetingStatusTones[meeting.status]}>
              {meetingStatusLabels[meeting.status]}
            </StatusBadge>
            <span className="text-xs font-semibold text-muted">
              {timingLabel}
            </span>
          </div>
          <h3 className="mt-2 min-w-0">
            <Link
              className={primarySurfaceLinkClassName(
                "break-words text-base leading-snug",
              )}
              href={meetingHref}
            >
              {meeting.title}
            </Link>
          </h3>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-2">
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-1">
              <dt className="font-semibold text-ink/70">Dato og tid</dt>
              <dd>
                <time dateTime={meeting.starts_at}>
                  {formatDateTime(meeting.starts_at)}
                </time>
              </dd>
            </div>
            {showCommittee ? (
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-1">
                <dt className="font-semibold text-ink/70">Udvalg</dt>
                <dd className="break-words">{meeting.committeeName}</dd>
              </div>
            ) : null}
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-1">
              <dt className="font-semibold text-ink/70">Dagsorden</dt>
              <dd>
                {agendaCount}{" "}
                {agendaCount === 1 ? "dagsordenspunkt" : "dagsordenspunkter"}
              </dd>
            </div>
            {!showCommittee ? (
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-1">
                <dt className="font-semibold text-ink/70">Udvalg</dt>
                <dd className="break-words">{meeting.committeeName}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="flex min-w-36 flex-col items-start gap-1 md:items-end">
          <span className="text-xs font-semibold text-muted">Næste trin</span>
          <Link
            aria-label={`${action.label}: ${meeting.title}`}
            className={buttonClassName({ size: "sm", variant: "secondary" })}
            href={actionHref(meetingHref, action.destination)}
          >
            {action.label}
          </Link>
        </div>
      </div>

      <MeetingAgendaPreview occurrences={meeting.agenda_item_occurrences} />
    </article>
  );
}

export function MeetingList({
  meetings,
  now,
  organizationId,
  showCommittee = true,
}: {
  meetings: MeetingListEntry[];
  now: number;
  organizationId: string;
  showCommittee?: boolean;
}) {
  return (
    <div className="divide-y divide-line overflow-hidden border border-line bg-surface/60">
      {meetings.map((meeting) => (
        <MeetingListRow
          key={meeting.id}
          meeting={meeting}
          now={now}
          organizationId={organizationId}
          showCommittee={showCommittee}
        />
      ))}
    </div>
  );
}
