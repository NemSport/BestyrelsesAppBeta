import Link from "next/link";

import { AppIcon } from "@/components/icons/app-icon";
import { MeetingAgendaPreview } from "@/components/meetings/meeting-agenda-preview";
import {
  Dropdown,
  StatusBadge,
  buttonClassName,
  primarySurfaceLinkClassName,
  staticSurfaceClassName,
  type StatusTone,
} from "@/components/ui";
import type { MeetingCapabilities } from "@/lib/meeting-capabilities";
import { getMeetingListAction, getMeetingListPeriod } from "@/lib/meeting-list";
import type { Database } from "@/types/database";
import type { MeetingWithAgendaPreview } from "@/types/domain";

type MinutesStatus = Database["public"]["Enums"]["meeting_minutes_status"];

export type MeetingListEntry = MeetingWithAgendaPreview & {
  committeeName: string;
  capabilities: MeetingCapabilities;
  minutesStatus?: MinutesStatus | null;
};

function actionHref(
  meetingHref: string,
  destination: ReturnType<typeof getMeetingListAction>["destination"],
) {
  if (destination === "minutes")
    return `${meetingHref}#general-minutes-heading`;
  return meetingHref;
}

function meetingDateLabel(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "full",
    timeZone: "Europe/Copenhagen",
  }).format(new Date(value));
}

function meetingTimeLabel(startsAt: string, endsAt: string | null) {
  const formatter = new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  });
  const start = formatter.format(new Date(startsAt)).replace(".", ":");
  if (!endsAt) return start;
  return `${start}–${formatter.format(new Date(endsAt)).replace(".", ":")}`;
}

function meetingOverviewStatus(meeting: MeetingListEntry): {
  label: string;
  tone: StatusTone;
} {
  if (meeting.status === "cancelled")
    return { label: "Aflyst", tone: "danger" };
  if (meeting.status === "in_progress") {
    return { label: "Møde i gang", tone: "progress" };
  }
  if (meeting.status === "completed") {
    if (meeting.minutesStatus === "approved") {
      return { label: "Referat godkendt", tone: "success" };
    }
    if (meeting.minutesStatus === "ready_for_approval") {
      return { label: "Afventer godkendelse", tone: "warning" };
    }
    if (meeting.minutesStatus === "draft") {
      return { label: "Referat mangler", tone: "warning" };
    }
    return { label: "Afsluttet", tone: "neutral" };
  }
  if (meeting.agenda_item_occurrences.length > 0) {
    return { label: "Dagsorden klar", tone: "info" };
  }
  return { label: "Klargøring", tone: "neutral" };
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
  const action = getMeetingListAction(
    meeting.status,
    meeting.capabilities,
    meeting.minutesStatus,
  );
  const agendaCount = meeting.agenda_item_occurrences.length;
  const period = getMeetingListPeriod(meeting, now);
  const status = meetingOverviewStatus(meeting);
  const primary = meeting.status === "in_progress";
  const secondaryActions = meeting.capabilities.updateMeeting ? (
    <Dropdown
      hideChevron
      key="meeting-actions"
      label={
        <>
          <AppIcon name="more" size={17} />
          <span className="sr-only">Flere handlinger for {meeting.title}</span>
        </>
      }
    >
      <Link
        className="flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-2 text-sm font-semibold text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        href={`${meetingHref}/edit`}
      >
        <AppIcon name="edit" size={15} />
        Redigér møde
      </Link>
    </Dropdown>
  ) : null;

  return (
    <article className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1.5 px-3 py-2.5 sm:px-3.5 lg:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1.4fr)_auto_auto] lg:items-center">
      <div className="col-span-2 min-w-0 lg:col-span-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 break-words text-base font-semibold leading-5 text-ink">
            <Link
              className={primarySurfaceLinkClassName(
                "!min-h-0 rounded-sm text-base leading-5 !no-underline after:hidden hover:!underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              )}
              href={meetingHref}
            >
              {meeting.title}
            </Link>
          </h3>
          <StatusBadge className="px-2.5 font-semibold" tone={status.tone}>
            {status.label}
          </StatusBadge>
        </div>
        {showCommittee ? (
          <p className="mt-0.5 break-words text-xs font-medium text-muted">
            {meeting.committeeName}
          </p>
        ) : null}
      </div>

      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted lg:col-span-1 lg:justify-end">
        <span className="inline-flex items-center gap-1 font-medium text-ink">
          <AppIcon className="text-muted" name="calendar" size={13} />
          <time dateTime={meeting.starts_at}>
            {meetingDateLabel(meeting.starts_at)}
          </time>
        </span>
        <span aria-hidden="true" className="text-line-strong">
          ·
        </span>
        <span>{meetingTimeLabel(meeting.starts_at, meeting.ends_at)}</span>
        {meeting.location ? (
          <>
            <span aria-hidden="true" className="text-line-strong">
              ·
            </span>
            <span className="break-words">{meeting.location}</span>
          </>
        ) : null}
        <span aria-hidden="true" className="text-line-strong">
          ·
        </span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <AppIcon name="agenda" size={13} />
          {agendaCount} {agendaCount === 1 ? "punkt" : "punkter"}
        </span>
      </div>

      <div className="flex min-w-0 items-center lg:justify-end">
        <Link
          aria-label={`${action.label}: ${meeting.title}`}
          className={buttonClassName({
            className: "px-2.5 text-xs",
            size: "sm",
            variant: primary ? "primary" : "secondary",
          })}
          href={actionHref(meetingHref, action.destination)}
        >
          {action.label}
          <AppIcon name="arrowRight" size={14} />
        </Link>
      </div>

      {period !== "cancelled" ? (
        <MeetingAgendaPreview
          controls={secondaryActions}
          integrated
          meetingHref={meetingHref}
          occurrences={meeting.agenda_item_occurrences}
        />
      ) : (
        <div className="flex items-center justify-end">{secondaryActions}</div>
      )}
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
    <div
      className={staticSurfaceClassName(
        "divide-y divide-line overflow-hidden bg-surface",
      )}
    >
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
