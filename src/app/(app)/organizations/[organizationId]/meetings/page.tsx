import Link from "next/link";
import { notFound } from "next/navigation";

import { MeetingList } from "@/components/meetings/meeting-list";
import { MeetingListFilters } from "@/components/meetings/meeting-list-filters";
import {
  EmptyState,
  PageHeader,
  PageSection,
  StatusBadge,
  buttonClassName,
  primarySurfaceLinkClassName,
  staticSurfaceClassName,
  type StatusTone,
} from "@/components/ui";
import {
  filterMeetingList,
  groupMeetingList,
  parseMeetingListFilters,
} from "@/lib/meeting-list";
import { formatDateTime, meetingMinutesStatusLabels } from "@/lib/localization";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { OrganizationService } from "@/services/organization-service";

type OrganizationOverview = Awaited<
  ReturnType<OrganizationService["getOverview"]>
>;
type RecentMinutes = OrganizationOverview["recentMinutes"][number];

const minutesStatusTones = {
  draft: "neutral",
  ready_for_approval: "warning",
  approved: "success",
} as const satisfies Record<string, StatusTone>;

function RecentMinutesRow({
  minutes,
  organizationRoot,
}: {
  minutes: RecentMinutes;
  organizationRoot: string;
}) {
  const meetingHref = `${organizationRoot}/committees/${minutes.committeeId}/meetings/${minutes.meetingId}#general-minutes-heading`;

  return (
    <article
      className={staticSurfaceClassName(
        "border-l-4 border-l-accent/55 px-3 py-3 sm:px-4",
      )}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <StatusBadge tone={minutesStatusTones[minutes.status]}>
            {meetingMinutesStatusLabels[minutes.status]}
          </StatusBadge>
          <h3 className="mt-2">
            <Link
              className={primarySurfaceLinkClassName(
                "break-words text-base leading-snug",
              )}
              href={meetingHref}
            >
              {minutes.meetingTitle}
            </Link>
          </h3>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-2">
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-1">
              <dt className="font-semibold text-ink/70">Dato og tid</dt>
              <dd>
                <time dateTime={minutes.meetingStartsAt}>
                  {formatDateTime(minutes.meetingStartsAt)}
                </time>
              </dd>
            </div>
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-1">
              <dt className="font-semibold text-ink/70">Udvalg</dt>
              <dd className="break-words">{minutes.committeeName}</dd>
            </div>
          </dl>
        </div>
        <div className="flex min-w-36 flex-col items-start gap-1 md:items-end">
          <span className="text-xs font-semibold text-muted">Næste trin</span>
          <Link
            aria-label={`Se referat: ${minutes.meetingTitle}`}
            className={buttonClassName({ size: "sm", variant: "secondary" })}
            href={meetingHref}
          >
            Se referat
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
  searchParams?: Promise<{
    date?: string;
    period?: string;
    status?: string;
  }>;
}) {
  const { organizationId } = await params;
  const filters = parseMeetingListFilters((await searchParams) ?? {});
  const filtersActive = Boolean(
    filters.date || filters.period || filters.status,
  );
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
  const capabilitiesByCommittee = new Map(
    overview.committees.map(({ committee, capabilities }) => [
      committee.id,
      capabilities,
    ]),
  );
  const meetingEntries = meetings.flatMap((meeting) => {
    const capabilities = capabilitiesByCommittee.get(meeting.committee_id);
    return capabilities ? [{ ...meeting, capabilities }] : [];
  });
  const now = Date.now();
  const grouped = groupMeetingList(meetingEntries, now);
  const filteredGrouped = groupMeetingList(
    filterMeetingList(meetingEntries, filters, now),
    now,
  );
  const filteredMeetings = [
    ...filteredGrouped.upcoming,
    ...filteredGrouped.previous,
    ...filteredGrouped.cancelled,
  ];
  const recentMinutes = [...overview.recentMinutes].sort(
    (left, right) =>
      new Date(right.meetingStartsAt).getTime() -
      new Date(left.meetingStartsAt).getTime(),
  );
  const organizationRoot = `/organizations/${organizationId}`;
  const meetingsRoot = `${organizationRoot}/meetings`;

  return (
    <div className="space-y-8">
      <PageHeader
        description="Et samlet overblik over møder og referater på tværs af de udvalg, du har adgang til."
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

      <MeetingListFilters filters={filters} resetHref={meetingsRoot} />

      {filtersActive ? (
        <PageSection
          description="Kommende resultater vises først, derefter de nyeste afholdte og aflyste."
          title="Filtrerede møder"
        >
          {filteredMeetings.length > 0 ? (
            <>
              <p className="mb-2 text-xs font-semibold text-muted">
                {filteredMeetings.length}{" "}
                {filteredMeetings.length === 1 ? "møde" : "møder"}
              </p>
              <MeetingList
                meetings={filteredMeetings}
                now={now}
                organizationId={organizationId}
              />
            </>
          ) : (
            <EmptyState
              action={
                <Link
                  className={buttonClassName({ variant: "secondary" })}
                  href={meetingsRoot}
                >
                  Nulstil filtre
                </Link>
              }
              description="Prøv at rydde et filter eller vælge en anden periode, status eller dato."
              kind="filtered"
              title="Ingen møder matcher filtrene."
            />
          )}
        </PageSection>
      ) : (
        <>
          <PageSection
            description="Næste møde først; igangværende møder placeres her."
            title="Kommende og igangværende"
          >
            {grouped.upcoming.length > 0 ? (
              <MeetingList
                meetings={grouped.upcoming}
                now={now}
                organizationId={organizationId}
              />
            ) : (
              <EmptyState
                action={
                  <Link
                    className={buttonClassName({ variant: "secondary" })}
                    href={`${organizationRoot}/committees`}
                  >
                    Åbn et udvalg
                  </Link>
                }
                description="Når der planlægges møder i dine udvalg, vises de her."
                title="Der er ingen kommende eller igangværende møder."
              />
            )}
          </PageSection>

          <PageSection
            description="Afholdte møder sorteret med nyeste mødedato først."
            title="Afholdte møder"
          >
            {grouped.previous.length > 0 ? (
              <MeetingList
                meetings={grouped.previous}
                now={now}
                organizationId={organizationId}
              />
            ) : (
              <EmptyState
                description="Afholdte møder vises her, når mødedatoen er passeret."
                title="Der er ingen afholdte møder."
              />
            )}
          </PageSection>

          {grouped.cancelled.length > 0 ? (
            <PageSection
              description="Aflyste møder sorteret med nyeste mødedato først."
              title="Aflyste møder"
            >
              <MeetingList
                meetings={grouped.cancelled}
                now={now}
                organizationId={organizationId}
              />
            </PageSection>
          ) : null}
        </>
      )}

      <PageSection
        description="Seneste referater med status; linket åbner referatafsnittet direkte."
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
