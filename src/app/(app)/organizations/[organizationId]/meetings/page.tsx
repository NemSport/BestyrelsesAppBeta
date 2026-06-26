import Link from "next/link";
import { notFound } from "next/navigation";

import {
  EmptyState,
  PageHeader,
  PageSection,
  StatusBadge,
  buttonClassName,
  type StatusTone,
} from "@/components/ui";
import {
  formatDanishDate,
  formatDanishDateKey,
} from "@/lib/date-format";
import {
  formatDateTime,
  meetingMinutesStatusLabels,
  meetingStatusLabels,
} from "@/lib/localization";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { OrganizationService } from "@/services/organization-service";

type OrganizationOverview = Awaited<
  ReturnType<OrganizationService["getOverview"]>
>;
type OrganizationMeeting = Awaited<
  ReturnType<OrganizationService["listMeetings"]>
>[number];
type RecentMinutes = OrganizationOverview["recentMinutes"][number];

const minutesStatusTones = {
  draft: "neutral",
  ready_for_approval: "warning",
  approved: "success",
} as const satisfies Record<string, StatusTone>;

const meetingStatusTones = {
  draft: "neutral",
  scheduled: "info",
  in_progress: "progress",
  completed: "success",
  cancelled: "danger",
} as const satisfies Record<string, StatusTone>;

function OrganizationMeetingRow({
  meeting,
  organizationRoot,
}: {
  meeting: OrganizationMeeting;
  organizationRoot: string;
}) {
  const meetingHref = `${organizationRoot}/committees/${meeting.committee_id}/meetings/${meeting.id}`;
  const agendaCount = meeting.agenda_item_occurrences.length;

  return (
    <article className="border-l-4 border-l-brand/55 border-y border-r border-line bg-surface px-3 py-3 transition hover:border-brand/35 hover:border-l-brand sm:px-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <Link
            className="text-base font-semibold text-ink hover:text-brand hover:underline"
            href={meetingHref}
          >
            {meeting.title}
          </Link>
          <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <div className="inline-flex gap-1">
              <dt className="font-semibold text-ink/70">Dato:</dt>
              <dd>{formatDateTime(meeting.starts_at)}</dd>
            </div>
            <div className="inline-flex gap-1">
              <dt className="font-semibold text-ink/70">Udvalg:</dt>
              <dd>{meeting.committeeName}</dd>
            </div>
            <div className="inline-flex gap-1">
              <dt className="font-semibold text-ink/70">Dagsorden:</dt>
              <dd>
                {agendaCount}{" "}
                {agendaCount === 1 ? "dagsordenspunkt" : "dagsordenspunkter"}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <StatusBadge tone={meetingStatusTones[meeting.status]}>
            {meetingStatusLabels[meeting.status]}
          </StatusBadge>
          <Link
            className={buttonClassName({ size: "sm", variant: "secondary" })}
            href={meetingHref}
          >
            Åbn møde
          </Link>
        </div>
      </div>
    </article>
  );
}

function isValidDateKey(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function sortMeetingsNewestFirst<T extends { created_at: string; starts_at: string }>(
  meetings: T[],
) {
  return [...meetings].sort((left, right) => {
    const byDate =
      new Date(right.starts_at).getTime() - new Date(left.starts_at).getTime();
    if (byDate !== 0) return byDate;
    return (
      new Date(right.created_at).getTime() -
      new Date(left.created_at).getTime()
    );
  });
}

function findNearbyMeetings(
  meetings: OrganizationMeeting[],
  selectedDate: string,
) {
  const sameDay = meetings.filter(
    (meeting) => formatDanishDateKey(meeting.starts_at) === selectedDate,
  );
  const before = meetings
    .filter(
      (meeting) => formatDanishDateKey(meeting.starts_at) < selectedDate,
    )
    .slice(0, 2);
  const after = [...meetings]
    .filter(
      (meeting) => formatDanishDateKey(meeting.starts_at) > selectedDate,
    )
    .reverse()
    .slice(0, 2);
  const seen = new Set<string>();

  return sortMeetingsNewestFirst([...sameDay, ...before, ...after]).filter(
    (meeting) => {
      if (seen.has(meeting.id)) return false;
      seen.add(meeting.id);
      return true;
    },
  );
}

function RecentMinutesRow({
  minutes,
  organizationRoot,
}: {
  minutes: RecentMinutes;
  organizationRoot: string;
}) {
  const meetingHref = `${organizationRoot}/committees/${minutes.committeeId}/meetings/${minutes.meetingId}`;

  return (
    <article className="border-l-4 border-l-accent/55 border-y border-r border-line bg-surface px-3 py-3 transition hover:border-accent/45 hover:border-l-accent sm:px-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <Link
            className="text-base font-semibold text-ink hover:text-brand hover:underline"
            href={meetingHref}
          >
            {minutes.meetingTitle}
          </Link>
          <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <div className="inline-flex gap-1">
              <dt className="font-semibold text-ink/70">Dato:</dt>
              <dd>{formatDateTime(minutes.meetingStartsAt)}</dd>
            </div>
            <div className="inline-flex gap-1">
              <dt className="font-semibold text-ink/70">Udvalg:</dt>
              <dd>{minutes.committeeName}</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <StatusBadge tone={minutesStatusTones[minutes.status]}>
            {meetingMinutesStatusLabels[minutes.status]}
          </StatusBadge>
          <Link
            className={buttonClassName({ size: "sm", variant: "secondary" })}
            href={meetingHref}
          >
            Åbn møde
          </Link>
        </div>
      </div>
    </article>
  );
}

export default async function OrganizationMeetingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams?: Promise<{ date?: string }>;
}) {
  const { organizationId } = await params;
  const { date } = (await searchParams) ?? {};
  const selectedDate = isValidDateKey(date) ? date : "";
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db)
    .requireOrganizationMember(organizationId, user.id)
    .catch(() => null);

  if (!context) notFound();

  const organizationService = new OrganizationService(db);
  const [overview, meetings] = await Promise.all([
    organizationService.getOverview(organizationId),
    organizationService.listMeetings(organizationId),
  ]);
  const organizationRoot = `/organizations/${organizationId}`;
  const sortedMeetings = sortMeetingsNewestFirst(meetings);
  const now = Date.now();
  const upcomingMeetings = sortedMeetings.filter(
    (meeting) => new Date(meeting.starts_at).getTime() >= now,
  );
  const previousMeetings = sortedMeetings.filter(
    (meeting) => new Date(meeting.starts_at).getTime() < now,
  );
  const nearbyMeetings = selectedDate
    ? findNearbyMeetings(sortedMeetings, selectedDate)
    : [];
  const selectedDateMatches = selectedDate
    ? sortedMeetings.filter(
        (meeting) => formatDanishDateKey(meeting.starts_at) === selectedDate,
      ).length
    : 0;
  const recentMinutes = [...overview.recentMinutes].sort(
    (left, right) =>
      new Date(right.meetingStartsAt).getTime() -
      new Date(left.meetingStartsAt).getTime(),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        description="Et samlet, roligt overblik over kommende møder og de seneste referater på tværs af organisationens udvalg."
        eyebrow={
          <Link
            className="text-muted transition hover:text-brand"
            href={organizationRoot}
          >
            ← Overblik
          </Link>
        }
        title={`Møder i ${context.organization.name}`}
      />

      <section className="border-y border-line bg-subtle/20 px-3 py-3 sm:px-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              Find møder omkring en dato
            </h2>
            <p className="mt-1 text-sm text-muted">
              Vælg en dato for at se møder på dagen og de nærmeste møder før
              og efter.
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
                href={`${organizationRoot}/meetings`}
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
                Møder omkring {formatDanishDate(`${selectedDate}T12:00:00Z`)}
              </h3>
              <p className="text-xs text-muted">
                {selectedDateMatches > 0
                  ? `${selectedDateMatches} møde(r) på valgt dato`
                  : "Ingen møder præcis på valgt dato"}
              </p>
            </div>
            {nearbyMeetings.length > 0 ? (
              <div className="divide-y divide-line overflow-hidden border border-line bg-surface/60">
                {nearbyMeetings.map((meeting) => (
                  <OrganizationMeetingRow
                    key={meeting.id}
                    meeting={meeting}
                    organizationRoot={organizationRoot}
                  />
                ))}
              </div>
            ) : (
              <p className="border border-line bg-surface px-3 py-3 text-sm text-muted">
                Der findes ingen møder omkring den valgte dato.
              </p>
            )}
          </div>
        ) : null}
      </section>

      <PageSection
        description="Planlagte møder i de udvalg, du har adgang til."
        title="Kommende møder"
      >
        {upcomingMeetings.length > 0 ? (
          <div className="divide-y divide-line overflow-hidden border border-line bg-surface/60">
            {upcomingMeetings.map((meeting) => (
              <OrganizationMeetingRow
                key={meeting.id}
                meeting={meeting}
                organizationRoot={organizationRoot}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            description="Når der oprettes møder i organisationens udvalg, vises de her."
            title="Der er ingen kommende møder."
          />
        )}
      </PageSection>

      <PageSection
        description="Afholdte møder sorteret med det nyeste møde først."
        title="Tidligere møder"
      >
        {previousMeetings.length > 0 ? (
          <div className="divide-y divide-line overflow-hidden border border-line bg-surface/60">
            {previousMeetings.map((meeting) => (
              <OrganizationMeetingRow
                key={meeting.id}
                meeting={meeting}
                organizationRoot={organizationRoot}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            description="Afholdte møder vises her, når mødedatoen er passeret."
            title="Der er ingen tidligere møder."
          />
        )}
      </PageSection>

      <PageSection
        description="Seneste møder med referatstatus. Selve referatet åbnes på mødesiden."
        title="Seneste referater"
      >
        {recentMinutes.length > 0 ? (
          <div className="divide-y divide-line overflow-hidden border border-line bg-surface/60">
            {recentMinutes.map((minutes) => (
              <RecentMinutesRow
                key={minutes.id}
                minutes={minutes}
                organizationRoot={organizationRoot}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            description="Når møder får referater, får du et samlet overblik her."
            title="Der er ingen nyere referater."
          />
        )}
      </PageSection>
    </div>
  );
}
