import Link from "next/link";
import { notFound } from "next/navigation";

import {
  EmptyState,
  PageHeader,
  PageSection,
  StatusBadge,
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
            <div className="divide-y divide-line border-y border-line">
              {overview.upcomingMeetings.map((meeting) => (
                <article
                  className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                  key={meeting.id}
                >
                  <div className="min-w-0">
                    <Link
                      className="font-semibold hover:text-brand hover:underline"
                      href={`${organizationRoot}/committees/${meeting.committee_id}/meetings/${meeting.id}`}
                    >
                      {meeting.title}
                    </Link>
                    <p className="mt-1 text-sm text-muted">
                      {formatDateTime(meeting.starts_at)} ·{" "}
                      {meeting.committeeName}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {meeting.agenda_item_occurrences.length}{" "}
                      {meeting.agenda_item_occurrences.length === 1
                        ? "dagsordenspunkt"
                        : "dagsordenspunkter"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={meetingStatusTones[meeting.status]}>
                      {meetingStatusLabels[meeting.status]}
                    </StatusBadge>
                    <Link
                      className="text-sm font-semibold text-brand hover:underline"
                      href={`${organizationRoot}/committees/${meeting.committee_id}/meetings/${meeting.id}`}
                    >
                      Åbn møde
                    </Link>
                  </div>
                </article>
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
            <div className="divide-y divide-line border-y border-line">
              {overview.recentMinutes.map((minutes) => (
                <article
                  className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                  key={minutes.id}
                >
                  <div className="min-w-0">
                    <Link
                      className="font-semibold hover:text-brand hover:underline"
                      href={`${organizationRoot}/committees/${minutes.committeeId}/meetings/${minutes.meetingId}`}
                    >
                      {minutes.meetingTitle}
                    </Link>
                    <p className="mt-1 text-sm text-muted">
                      {formatDateTime(minutes.meetingStartsAt)} ·{" "}
                      {minutes.committeeName}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={minutesStatusTones[minutes.status]}>
                      {meetingMinutesStatusLabels[minutes.status]}
                    </StatusBadge>
                    <Link
                      className="text-sm font-semibold text-brand hover:underline"
                      href={`${organizationRoot}/committees/${minutes.committeeId}/meetings/${minutes.meetingId}`}
                    >
                      Åbn møde
                    </Link>
                  </div>
                </article>
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
