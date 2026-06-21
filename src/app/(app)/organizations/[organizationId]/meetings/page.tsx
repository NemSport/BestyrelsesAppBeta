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
type UpcomingMeeting = OrganizationOverview["upcomingMeetings"][number];
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
  meeting: UpcomingMeeting;
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
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db)
    .requireOrganizationMember(organizationId, user.id)
    .catch(() => null);

  if (!context) notFound();

  const overview = await new OrganizationService(db).getOverview(organizationId);
  const organizationRoot = `/organizations/${organizationId}`;

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

      <PageSection
        description="Planlagte møder i de udvalg, du har adgang til."
        title="Kommende møder"
      >
        {overview.upcomingMeetings.length > 0 ? (
          <div className="divide-y divide-line overflow-hidden border border-line bg-surface/60">
            {overview.upcomingMeetings.map((meeting) => (
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
        description="Seneste møder med referatstatus. Selve referatet åbnes på mødesiden."
        title="Seneste referater"
      >
        {overview.recentMinutes.length > 0 ? (
          <div className="divide-y divide-line overflow-hidden border border-line bg-surface/60">
            {overview.recentMinutes.map((minutes) => (
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
