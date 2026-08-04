import Link from "next/link";

import { MeetingList } from "@/components/meetings/meeting-list";
import { MeetingListFilters } from "@/components/meetings/meeting-list-filters";
import { EmptyState, PageSection, buttonClassName } from "@/components/ui";
import {
  filterMeetingList,
  groupMeetingList,
  parseMeetingListFilters,
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
  const filters = parseMeetingListFilters((await searchParams) ?? {});
  const filtersActive = Boolean(
    filters.date || filters.period || filters.status,
  );
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
  const grouped = groupMeetingList(meetings, now);
  const filteredGrouped = groupMeetingList(
    filterMeetingList(meetings, filters, now),
    now,
  );
  const filteredMeetings = [
    ...filteredGrouped.upcoming,
    ...filteredGrouped.previous,
    ...filteredGrouped.cancelled,
  ];
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
      <div className="space-y-6">
        <MeetingListFilters filters={filters} resetHref={meetingsRoot} />

        {filtersActive ? (
          <section aria-labelledby="filtered-meetings-heading">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  className="text-sm font-semibold text-ink"
                  id="filtered-meetings-heading"
                >
                  Filtrerede møder
                </h2>
                <p className="text-xs text-muted">
                  Resultaterne vises med kommende først og derefter de nyeste
                  afholdte og aflyste.
                </p>
              </div>
              <span className="text-xs font-semibold text-muted">
                {filteredMeetings.length}{" "}
                {filteredMeetings.length === 1 ? "møde" : "møder"}
              </span>
            </div>
            {filteredMeetings.length > 0 ? (
              <MeetingList
                meetings={filteredMeetings}
                now={now}
                organizationId={organizationId}
                showCommittee={false}
              />
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
          </section>
        ) : meetings.length > 0 ? (
          <>
            <section aria-labelledby="upcoming-meetings-heading">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2
                    className="text-sm font-semibold text-ink"
                    id="upcoming-meetings-heading"
                  >
                    Kommende og igangværende
                  </h2>
                  <p className="text-xs text-muted">
                    Næste møde først; igangværende møder placeres her.
                  </p>
                </div>
                <span className="text-xs font-semibold text-muted">
                  {grouped.upcoming.length} møde(r)
                </span>
              </div>
              {grouped.upcoming.length > 0 ? (
                <MeetingList
                  meetings={grouped.upcoming}
                  now={now}
                  organizationId={organizationId}
                  showCommittee={false}
                />
              ) : (
                <p className="border border-line bg-surface px-3 py-3 text-sm text-muted">
                  Der er ingen kommende eller igangværende møder.
                </p>
              )}
            </section>

            <section aria-labelledby="previous-meetings-heading">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2
                    className="text-sm font-semibold text-ink"
                    id="previous-meetings-heading"
                  >
                    Afholdte møder
                  </h2>
                  <p className="text-xs text-muted">Nyeste mødedato først.</p>
                </div>
                <span className="text-xs font-semibold text-muted">
                  {grouped.previous.length} møde(r)
                </span>
              </div>
              {grouped.previous.length > 0 ? (
                <MeetingList
                  meetings={grouped.previous}
                  now={now}
                  organizationId={organizationId}
                  showCommittee={false}
                />
              ) : (
                <p className="border border-line bg-surface px-3 py-3 text-sm text-muted">
                  Der er ingen afholdte møder.
                </p>
              )}
            </section>

            {grouped.cancelled.length > 0 ? (
              <details className="group border-y border-line">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  <span>
                    Aflyste møder
                    <span className="ml-2 font-normal text-muted">
                      {grouped.cancelled.length} møde(r)
                    </span>
                  </span>
                  <span className="text-xs text-brand">
                    <span className="group-open:hidden">Vis</span>
                    <span className="hidden group-open:inline">Skjul</span>
                  </span>
                </summary>
                <div className="pb-4">
                  <MeetingList
                    meetings={grouped.cancelled}
                    now={now}
                    organizationId={organizationId}
                    showCommittee={false}
                  />
                </div>
              </details>
            ) : null}
          </>
        ) : (
          <EmptyState
            action={
              capabilities.createMeeting ? (
                <Link
                  className={buttonClassName()}
                  href={`${meetingsRoot}/new`}
                >
                  Opret første møde
                </Link>
              ) : undefined
            }
            description={
              capabilities.createMeeting
                ? "Opret et møde for at samle dagsorden, referat og opfølgning."
                : "Når en ansvarlig opretter et møde, vises dagsorden, referat og opfølgning her."
            }
            kind={capabilities.createMeeting ? "empty" : "read-only"}
            title="Der er endnu ikke oprettet nogen møder."
          />
        )}
      </div>
    </PageSection>
  );
}
