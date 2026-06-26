import Link from "next/link";

import { MeetingAgendaPreview } from "@/components/meetings/meeting-agenda-preview";
import {
  EmptyState,
  PageSection,
  StatusBadge,
  buttonClassName,
} from "@/components/ui";
import { formatDanishDateKey } from "@/lib/date-format";
import { formatDateTime, meetingStatusLabels } from "@/lib/localization";
import { canManageCommittee } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { MeetingService } from "@/services/meeting-service";

type CommitteeMeeting = Awaited<ReturnType<MeetingService["list"]>>[number];

function dateKey(value: string) {
  return formatDanishDateKey(value);
}

function isValidDateKey(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function statusTone(status: CommitteeMeeting["status"]) {
  if (status === "completed") return "success";
  if (status === "cancelled") return "danger";
  if (status === "in_progress") return "progress";
  return "info";
}

function MeetingRow({
  meeting,
  root,
}: {
  meeting: CommitteeMeeting;
  root: string;
}) {
  return (
    <article className="border-l-4 border-l-brand/55 border-y border-r border-line bg-surface px-3 py-3 transition hover:border-brand/35 hover:border-l-brand sm:px-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <Link
            className="text-base font-semibold text-ink hover:text-brand hover:underline"
            href={`${root}/meetings/${meeting.id}`}
          >
            {meeting.title}
          </Link>
          <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <div className="inline-flex gap-1">
              <dt className="font-semibold text-ink/70">Dato:</dt>
              <dd>{formatDateTime(meeting.starts_at)}</dd>
            </div>
            <div className="inline-flex gap-1">
              <dt className="font-semibold text-ink/70">Sted:</dt>
              <dd>{meeting.location || "Ikke angivet"}</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <StatusBadge tone={statusTone(meeting.status)}>
            {meetingStatusLabels[meeting.status]}
          </StatusBadge>
          <Link
            className={buttonClassName({ size: "sm", variant: "secondary" })}
            href={`${root}/meetings/${meeting.id}`}
          >
            Åbn møde
          </Link>
        </div>
      </div>

      <MeetingAgendaPreview occurrences={meeting.agenda_item_occurrences} />
    </article>
  );
}

function MeetingRows({
  meetings,
  root,
}: {
  meetings: CommitteeMeeting[];
  root: string;
}) {
  return (
    <div className="divide-y divide-line overflow-hidden border border-line bg-surface/60">
      {meetings.map((meeting) => (
        <MeetingRow key={meeting.id} meeting={meeting} root={root} />
      ))}
    </div>
  );
}

function findNearbyMeetings(meetings: CommitteeMeeting[], selectedDate: string) {
  const sameDay = meetings.filter((meeting) => dateKey(meeting.starts_at) === selectedDate);
  const before = meetings
    .filter((meeting) => dateKey(meeting.starts_at) < selectedDate)
    .slice(0, 2);
  const after = [...meetings]
    .filter((meeting) => dateKey(meeting.starts_at) > selectedDate)
    .reverse()
    .slice(0, 2);
  const seen = new Set<string>();
  return [...sameDay, ...before, ...after]
    .sort(
      (left, right) =>
        new Date(right.starts_at).getTime() -
          new Date(left.starts_at).getTime() ||
        new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime(),
    )
    .filter((meeting) => {
      if (seen.has(meeting.id)) return false;
      seen.add(meeting.id);
      return true;
    });
}

export default async function MeetingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; committeeId: string }>;
  searchParams?: Promise<{ date?: string }>;
}) {
  const { organizationId, committeeId } = await params;
  const { date } = (await searchParams) ?? {};
  const selectedDate = isValidDateKey(date) ? date : "";
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db).requireCommitteeMember(
    organizationId,
    committeeId,
    user.id,
  );
  const meetings = [...await new MeetingService(db).list(
    organizationId,
    committeeId,
  )].sort(
    (left, right) =>
      new Date(right.starts_at).getTime() -
        new Date(left.starts_at).getTime() ||
      new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
  );
  const root = `/organizations/${organizationId}/committees/${committeeId}`;
  const canEdit = canManageCommittee(
    context.organizationMembership.role,
    context.membership?.role ?? null,
  );
  const now = Date.now();
  const upcomingMeetings = meetings.filter(
    (meeting) => new Date(meeting.starts_at).getTime() >= now,
  );
  const previousMeetings = meetings.filter(
    (meeting) => new Date(meeting.starts_at).getTime() < now,
  );
  const nearbyMeetings = selectedDate
    ? findNearbyMeetings(meetings, selectedDate)
    : [];
  const selectedDateMatches = selectedDate
    ? meetings.filter((meeting) => dateKey(meeting.starts_at) === selectedDate)
        .length
    : 0;

  return (
    <PageSection
      actions={
        canEdit ? (
          <Link className={buttonClassName()} href={`${root}/meetings/new`}>
            Nyt møde
          </Link>
        ) : null
      }
      description="Planlæg, afhold og følg op på udvalgets møder."
      eyebrow="Møder"
      title={`${context.committee.name} · Mødeplan`}
    >
      <section className="mb-5 border-y border-line bg-subtle/20 px-3 py-3 sm:px-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              Find møder omkring en dato
            </h2>
            <p className="mt-1 text-sm text-muted">
              Vælg en dato for hurtigt at finde møder på dagen eller de nærmeste
              møder før og efter.
            </p>
          </div>
          <form className="flex flex-wrap items-end gap-2" method="get">
            <label className="grid gap-1 text-xs font-semibold text-muted">
              Dato
              <input
                className="field min-h-9 w-44 px-3 py-2 text-sm"
                defaultValue={selectedDate}
                name="date"
                type="date"
              />
            </label>
            <button
              className={buttonClassName({ size: "sm", variant: "secondary" })}
              type="submit"
            >
              Find møder
            </button>
            {selectedDate ? (
              <Link
                className={buttonClassName({ size: "sm", variant: "ghost" })}
                href={`${root}/meetings`}
              >
                Ryd dato
              </Link>
            ) : null}
          </form>
        </div>

        {selectedDate ? (
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">
                Møder omkring {selectedDate}
              </h3>
              <p className="text-xs text-muted">
                {selectedDateMatches > 0
                  ? `${selectedDateMatches} møde(r) på valgt dato`
                  : "Ingen møder præcis på valgt dato"}
              </p>
            </div>
            {nearbyMeetings.length > 0 ? (
              <MeetingRows meetings={nearbyMeetings} root={root} />
            ) : (
              <p className="border border-line bg-surface px-3 py-3 text-sm text-muted">
                Der findes ingen møder omkring den valgte dato.
              </p>
            )}
          </div>
        ) : null}
      </section>

      {meetings.length > 0 ? (
        <div className="space-y-6">
          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Kommende møder</h2>
                <p className="text-xs text-muted">
                  De næste møder i udvalget med status og hurtig adgang.
                </p>
              </div>
              <span className="text-xs font-semibold text-muted">
                {upcomingMeetings.length} møde(r)
              </span>
            </div>
            {upcomingMeetings.length > 0 ? (
              <MeetingRows meetings={upcomingMeetings} root={root} />
            ) : (
              <p className="border border-line bg-surface px-3 py-3 text-sm text-muted">
                Der er ingen kommende møder.
              </p>
            )}
          </section>

          <details className="group border-y border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <span>
                Tidligere møder
                <span className="ml-2 font-normal text-muted">
                  {previousMeetings.length} møde(r)
                </span>
              </span>
              <span className="text-xs text-brand">
                <span className="group-open:hidden">Vis</span>
                <span className="hidden group-open:inline">Skjul</span>
              </span>
            </summary>
            <div className="pb-4">
              {previousMeetings.length > 0 ? (
                <MeetingRows meetings={previousMeetings} root={root} />
              ) : (
                <p className="border border-line bg-surface px-3 py-3 text-sm text-muted">
                  Der er ingen tidligere møder.
                </p>
              )}
            </div>
          </details>
        </div>
      ) : (
        <EmptyState
          description="Opret et møde for at samle dagsorden, referat og opfølgning."
          title="Der er endnu ikke oprettet nogen møder."
        />
      )}
    </PageSection>
  );
}
