import Link from "next/link";
import { notFound } from "next/navigation";

import { AppIcon } from "@/components/icons/app-icon";
import { MeetingList } from "@/components/meetings/meeting-list";
import { MeetingListFilters } from "@/components/meetings/meeting-list-filters";
import { MeetingOverviewContext } from "@/components/meetings/meeting-overview-context";
import { EmptyState, PageHeader, buttonClassName } from "@/components/ui";
import {
  filterMeetingList,
  groupMeetingList,
  parseMeetingListFilters,
  sortMeetingList,
} from "@/lib/meeting-list";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { OrganizationService } from "@/services/organization-service";

export default async function OrganizationMeetingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams?: Promise<{
    committee?: string;
    date?: string;
    period?: string;
    status?: string;
  }>;
}) {
  const { organizationId } = await params;
  const requestedFilters = parseMeetingListFilters((await searchParams) ?? {});
  const filters = {
    ...requestedFilters,
    period: requestedFilters.period === "previous" ? "previous" : "upcoming",
  } as const;
  const filtersActive = Boolean(
    filters.committeeId || filters.date || filters.status,
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
  const minutesStatusByMeeting = new Map(
    overview.recentMinutes.map((minutes) => [
      minutes.meetingId,
      minutes.status,
    ]),
  );
  const meetingEntries = meetings.flatMap((meeting) => {
    const capabilities = capabilitiesByCommittee.get(meeting.committee_id);
    return capabilities
      ? [
          {
            ...meeting,
            capabilities,
            minutesStatus: minutesStatusByMeeting.get(meeting.id) ?? null,
          },
        ]
      : [];
  });
  const visibleCommitteeIds = new Set(
    overview.committees.map(({ committee }) => committee.id),
  );
  const safeFilters = {
    ...filters,
    committeeId: visibleCommitteeIds.has(filters.committeeId)
      ? filters.committeeId
      : "",
  };
  const now = Date.now();
  const grouped = groupMeetingList(meetingEntries, now);
  const filteredGrouped = groupMeetingList(
    filterMeetingList(meetingEntries, { ...safeFilters, period: "" }, now),
    now,
  );
  const selectedMeetings =
    safeFilters.period === "previous"
      ? sortMeetingList(
          [...filteredGrouped.previous, ...filteredGrouped.cancelled],
          "previous",
        )
      : filteredGrouped.upcoming;
  const meetingCommittee = overview.committees.find(
    ({ capabilities }) => capabilities.createMeeting,
  );
  const organizationRoot = `/organizations/${organizationId}`;
  const meetingsRoot = `${organizationRoot}/meetings`;
  const selectedLabel =
    safeFilters.period === "previous" ? "Afholdte møder" : "Kommende møder";

  return (
    <div className="space-y-4" data-meeting-overview>
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className={buttonClassName({ size: "sm", variant: "secondary" })}
              href="#meeting-filters"
            >
              <AppIcon name="filter" size={15} />
              Filter
            </Link>
            {meetingCommittee ? (
              <Link
                className={buttonClassName({ size: "sm" })}
                href={`${organizationRoot}/committees/${meetingCommittee.committee.id}/meetings/new`}
              >
                <AppIcon name="meetingAdd" size={15} />
                Nyt møde
              </Link>
            ) : null}
          </div>
        }
        description="Få overblik over kommende og afholdte møder."
        eyebrow={
          <Link
            className="text-muted transition hover:text-brand"
            href={organizationRoot}
          >
            ← Overblik
          </Link>
        }
        title="Mødeoversigt"
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,79fr)_minmax(15rem,21fr)] xl:items-start">
        <div className="min-w-0 space-y-2">
          <MeetingListFilters
            committees={overview.committees.map(({ committee }) => ({
              id: committee.id,
              name: committee.name,
            }))}
            filters={safeFilters}
            resetHref={meetingsRoot}
          />

          <section aria-labelledby="meeting-list-heading">
            <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2
                  className="text-sm font-semibold text-ink"
                  id="meeting-list-heading"
                >
                  {selectedLabel}
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {safeFilters.period === "previous"
                    ? "Nyeste møde først."
                    : "Nærmeste møde først."}
                </p>
              </div>
              <span className="text-xs font-medium tabular-nums text-muted">
                {selectedMeetings.length}{" "}
                {selectedMeetings.length === 1 ? "møde" : "møder"}
              </span>
            </div>

            {selectedMeetings.length > 0 ? (
              <MeetingList
                meetings={selectedMeetings}
                now={now}
                organizationId={organizationId}
              />
            ) : (
              <EmptyState
                action={
                  filtersActive ? (
                    <Link
                      className={buttonClassName({ variant: "secondary" })}
                      href={`${meetingsRoot}?period=${safeFilters.period}`}
                    >
                      Nulstil filtre
                    </Link>
                  ) : meetingCommittee && safeFilters.period === "upcoming" ? (
                    <Link
                      className={buttonClassName()}
                      href={`${organizationRoot}/committees/${meetingCommittee.committee.id}/meetings/new`}
                    >
                      Opret møde
                    </Link>
                  ) : undefined
                }
                description={
                  filtersActive
                    ? "Prøv at nulstille filtrene eller vælge en anden dato eller status."
                    : safeFilters.period === "previous"
                      ? "Afholdte og aflyste møder vises her som historik."
                      : "Der er ingen planlagte møder lige nu."
                }
                kind={filtersActive ? "filtered" : "empty"}
                title={
                  filtersActive
                    ? "Ingen møder matcher filtrene"
                    : safeFilters.period === "previous"
                      ? "Ingen afholdte møder endnu"
                      : "Ingen kommende møder"
                }
              />
            )}
          </section>
        </div>

        <MeetingOverviewContext
          followUpCount={overview.metrics.openFollowUpCount}
          myOpenTaskCount={overview.metrics.myOpenTaskCount}
          nextMeeting={grouped.upcoming[0] ?? null}
          organizationId={organizationId}
          pendingApprovalCount={overview.pendingMinutesApprovals.length}
          recentMinutes={overview.recentMinutes[0] ?? null}
        />
      </div>
    </div>
  );
}
