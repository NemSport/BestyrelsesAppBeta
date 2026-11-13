import Link from "next/link";
import { notFound } from "next/navigation";

import { AppIcon } from "@/components/icons/app-icon";
import { MeetingList } from "@/components/meetings/meeting-list";
import { MeetingListFilters } from "@/components/meetings/meeting-list-filters";
import { EmptyState, PageHeader, buttonClassName } from "@/components/ui";
import {
  filterMeetingList,
  getMeetingListHref,
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
  const returnTo = getMeetingListHref(meetingsRoot, {
    ...safeFilters,
    period: requestedFilters.period ? safeFilters.period : "",
  });
  const selectedLabel =
    safeFilters.period === "previous" ? "Afholdte møder" : "Kommende møder";

  return (
    <div className="space-y-3" data-meeting-overview>
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {meetingCommittee ? (
              <>
                <Link
                  className={buttonClassName({ size: "sm" })}
                  href={`${meetingsRoot}/polls`}
                >
                  <AppIcon aria-hidden="true" name="calendar" size={15} />
                  Datoafstemning
                </Link>
                <Link
                  className={buttonClassName({ size: "sm" })}
                  href={`${organizationRoot}/committees/${meetingCommittee.committee.id}/meetings/new`}
                >
                  <AppIcon name="meetingAdd" size={15} />
                  Nyt møde
                </Link>
              </>
            ) : null}
          </div>
        }
        className="!gap-2 !pb-2 sm:!items-center"
        title="Mødeoversigt"
      />

      <nav
        aria-label="Mødeperiode"
        className="flex flex-wrap gap-1 border-b border-line"
      >
        {(
          [
            ["upcoming", "Kommende møder"],
            ["previous", "Afholdte møder"],
          ] as const
        ).map(([period, label]) => (
          <Link
            key={period}
            aria-current={safeFilters.period === period ? "page" : undefined}
            className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold ${safeFilters.period === period ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
            href={getMeetingListHref(meetingsRoot, {
              committeeId: safeFilters.committeeId,
              period,
              date: "",
              status: "",
            })}
          >
            {label}
          </Link>
        ))}
      </nav>
      <MeetingListFilters
        committees={overview.committees.map(({ committee }) => ({
          id: committee.id,
          name: committee.name,
        }))}
        filters={safeFilters}
        showPeriod={false}
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
            returnTo={returnTo}
          />
        ) : (
          <EmptyState
            compact
            action={
              filtersActive ? (
                <Link
                  className={buttonClassName({ variant: "secondary" })}
                  href={`${meetingsRoot}?period=${safeFilters.period}`}
                >
                  Nulstil filtre
                </Link>
              ) : undefined
            }
            description={
              filtersActive
                ? "Prøv at nulstille filtrene eller vælge en anden dato eller status."
                : undefined
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
  );
}
