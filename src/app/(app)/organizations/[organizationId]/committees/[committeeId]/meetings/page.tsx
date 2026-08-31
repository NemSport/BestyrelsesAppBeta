import Link from "next/link";

import { MeetingList } from "@/components/meetings/meeting-list";
import { MeetingListFilters } from "@/components/meetings/meeting-list-filters";
import { EmptyState, PageSection, buttonClassName } from "@/components/ui";
import {
  filterMeetingList,
  groupMeetingList,
  parseMeetingListFilters,
  sortMeetingList,
} from "@/lib/meeting-list";
import { getMeetingCapabilities } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { MeetingService } from "@/services/meeting-service";

export default async function MeetingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; committeeId: string }>;
  searchParams?: Promise<{
    date?: string;
    period?: string;
    status?: string;
  }>;
}) {
  const { organizationId, committeeId } = await params;
  const requestedFilters = parseMeetingListFilters((await searchParams) ?? {});
  const filters = {
    ...requestedFilters,
    committeeId: "",
    period: requestedFilters.period === "previous" ? "previous" : "upcoming",
  } as const;
  const filtersActive = Boolean(filters.date || filters.status);
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db).requireCommitteeMember(
    organizationId,
    committeeId,
    user.id,
  );
  const capabilities = getMeetingCapabilities(
    context.organizationMembership.role,
    context.membership?.role ?? null,
  );
  const meetings = (
    await new MeetingService(db).list(organizationId, committeeId)
  ).map((meeting) => ({
    ...meeting,
    capabilities,
    committeeName: context.committee.name,
  }));
  const now = Date.now();
  const filteredGrouped = groupMeetingList(
    filterMeetingList(meetings, { ...filters, period: "" }, now),
    now,
  );
  const selectedMeetings =
    filters.period === "previous"
      ? sortMeetingList(
          [...filteredGrouped.previous, ...filteredGrouped.cancelled],
          "previous",
        )
      : filteredGrouped.upcoming;
  const root = `/organizations/${organizationId}/committees/${committeeId}`;
  const meetingsRoot = `${root}/meetings`;

  return (
    <PageSection
      actions={
        capabilities.createMeeting ? (
          <Link className={buttonClassName()} href={`${meetingsRoot}/new`}>
            Nyt møde
          </Link>
        ) : null
      }
      description="Planlæg, afhold og følg op på udvalgets møder."
      eyebrow="Møder"
      title={`${context.committee.name} · Mødeplan`}
    >
      <div className="space-y-3">
        <MeetingListFilters filters={filters} resetHref={meetingsRoot} />

        <section aria-labelledby="committee-meeting-list-heading">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2
                className="text-sm font-semibold text-ink"
                id="committee-meeting-list-heading"
              >
                {filters.period === "previous"
                  ? "Afholdte møder"
                  : "Kommende møder"}
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {filters.period === "previous"
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
              showCommittee={false}
            />
          ) : (
            <EmptyState
              action={
                filtersActive ? (
                  <Link
                    className={buttonClassName({ variant: "secondary" })}
                    href={`${meetingsRoot}?period=${filters.period}`}
                  >
                    Nulstil filtre
                  </Link>
                ) : capabilities.createMeeting &&
                  filters.period === "upcoming" ? (
                  <Link
                    className={buttonClassName()}
                    href={`${meetingsRoot}/new`}
                  >
                    Opret møde
                  </Link>
                ) : undefined
              }
              description={
                filtersActive
                  ? "Prøv at nulstille filtrene eller vælge en anden dato eller status."
                  : filters.period === "previous"
                    ? "Afholdte og aflyste møder vises her som historik."
                    : capabilities.createMeeting
                      ? "Opret et møde for at samle dagsorden, referat og opfølgning."
                      : "Når en ansvarlig opretter et møde, vises det her."
              }
              kind={
                filtersActive
                  ? "filtered"
                  : capabilities.createMeeting
                    ? "empty"
                    : "read-only"
              }
              title={
                filtersActive
                  ? "Ingen møder matcher filtrene"
                  : filters.period === "previous"
                    ? "Ingen afholdte møder endnu"
                    : "Ingen kommende møder"
              }
            />
          )}
        </section>
      </div>
    </PageSection>
  );
}
