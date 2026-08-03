import Link from "next/link";

import { DashboardPriorityPanel } from "@/components/dashboard/dashboard-priority-panel";
import { RelatedDecisions } from "@/components/decisions/related-decisions";
import { RelatedTasks } from "@/components/tasks/related-tasks";
import {
  EmptyState,
  StatusBadge,
  SurfaceLinkCue,
  buttonClassName,
  interactiveSurfaceClassName,
} from "@/components/ui";
import {
  organizationPriorityCopy,
  resolveOrganizationDashboardAudience,
} from "@/lib/dashboard-prioritization";
import { formatDateTime, meetingStatusLabels } from "@/lib/localization";
import type { OrganizationRole } from "@/lib/meeting-capabilities";
import type { OrganizationOverview } from "@/types/domain";

export function OrganizationDashboardPriority({
  organizationId,
  organizationRole,
  overview,
}: {
  organizationId: string;
  organizationRole: OrganizationRole;
  overview: OrganizationOverview;
}) {
  const audience = resolveOrganizationDashboardAudience(
    organizationRole,
    overview.committees.map(({ capabilities }) => capabilities),
  );
  const copy = organizationPriorityCopy[audience];
  const organizationRoot = `/organizations/${organizationId}`;
  const nextMeeting = overview.upcomingMeetings[0] ?? null;
  const latestApprovedMinutes = overview.recentMinutes.find(
    (minutes) => minutes.status === "approved",
  );
  const managedCommitteeIds = new Set(
    overview.committees
      .filter(({ capabilities }) => capabilities.manageMinutesApproval)
      .map(({ committee }) => committee.id),
  );
  const managedMeeting = overview.upcomingMeetings.find((meeting) =>
    managedCommitteeIds.has(meeting.committee_id),
  );
  const managedMinutes = overview.recentMinutes.find(
    (minutes) =>
      managedCommitteeIds.has(minutes.committeeId) &&
      minutes.status === "ready_for_approval",
  );
  const managedCommittee = overview.committees.find(({ committee }) =>
    managedCommitteeIds.has(committee.id),
  );
  const committeeByAttention = [...overview.committees].sort((left, right) => {
    const leftCount =
      left.openTaskCount + left.activeDecisionCount + left.openFollowUpCount;
    const rightCount =
      right.openTaskCount + right.activeDecisionCount + right.openFollowUpCount;
    return rightCount - leftCount;
  });

  return (
    <div data-dashboard-audience={audience}>
      <DashboardPriorityPanel
        action={
          audience === "member" ? (
            <Link
              className={buttonClassName({ size: "sm" })}
              href={`${organizationRoot}/tasks/my`}
            >
              Åbn mine opgaver
            </Link>
          ) : audience === "admin" ? (
            <Link
              className={buttonClassName({ size: "sm" })}
              href={`${organizationRoot}/committees`}
            >
              Se udvalg
            </Link>
          ) : null
        }
        description={copy.description}
        eyebrow={copy.eyebrow}
        title={copy.title}
      >
        {audience === "viewer" ? (
          <div className="grid gap-3 md:grid-cols-2">
            {nextMeeting ? (
              <Link
                className={interactiveSurfaceClassName("bg-surface p-4")}
                href={`${organizationRoot}/committees/${nextMeeting.committee_id}/meetings/${nextMeeting.id}`}
              >
                <span className="font-semibold">{nextMeeting.title}</span>
                <p className="mt-1 text-sm text-muted">
                  {formatDateTime(nextMeeting.starts_at)} ·{" "}
                  {nextMeeting.committeeName}
                </p>
                <SurfaceLinkCue label="Åbn møde" />
              </Link>
            ) : (
              <EmptyState
                compact
                description="Når et udvalg planlægger et møde, vises det her."
                title="Der er intet kommende møde at læse endnu."
              />
            )}
            {latestApprovedMinutes ? (
              <Link
                className={interactiveSurfaceClassName("bg-surface p-4")}
                href={`${organizationRoot}/committees/${latestApprovedMinutes.committeeId}/meetings/${latestApprovedMinutes.meetingId}`}
              >
                <span className="font-semibold">Seneste godkendte referat</span>
                <p className="mt-1 text-sm text-muted">
                  {latestApprovedMinutes.meetingTitle} ·{" "}
                  {latestApprovedMinutes.committeeName}
                </p>
                <SurfaceLinkCue label="Læs referat" />
              </Link>
            ) : (
              <EmptyState
                compact
                description="Godkendte referater vises her, når de er tilgængelige for dig."
                title="Der er intet godkendt referat endnu."
              />
            )}
          </div>
        ) : audience === "member" ? (
          overview.myOpenTasks.length ? (
            <RelatedTasks
              compact
              organizationId={organizationId}
              tasks={overview.myOpenTasks}
            />
          ) : overview.activeDecisions.length ? (
            <div>
              <p className="mb-3 text-sm text-muted">
                Du har ingen åbne opgaver. Gennemgå i stedet de aktive
                beslutninger.
              </p>
              <RelatedDecisions
                compact
                decisions={overview.activeDecisions}
                organizationId={organizationId}
              />
            </div>
          ) : (
            <EmptyState
              compact
              description="Der vises kun opgaver, som er tildelt dig. Brug kommende møder som næste kontekst."
              title="Du har ingen åbne opgaver."
            />
          )
        ) : audience === "chair" ? (
          managedMeeting || managedMinutes ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="font-semibold">
                  {managedMinutes?.meetingTitle ?? managedMeeting?.title}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {managedMinutes
                    ? formatDateTime(managedMinutes.meetingStartsAt)
                    : formatDateTime(managedMeeting!.starts_at)}{" "}
                  ·{" "}
                  {managedMinutes?.committeeName ??
                    managedMeeting?.committeeName}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {managedMeeting ? (
                    <>
                      <StatusBadge>
                        {managedMeeting.agenda_item_occurrences.length} punkter
                      </StatusBadge>
                      <StatusBadge>
                        {meetingStatusLabels[managedMeeting.status]}
                      </StatusBadge>
                    </>
                  ) : null}
                  {managedMinutes ? (
                    <StatusBadge tone="warning">
                      Referat kræver opfølgning
                    </StatusBadge>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {managedMeeting ? (
                  <Link
                    className={buttonClassName({
                      size: "sm",
                      variant: "secondary",
                    })}
                    href={`${organizationRoot}/committees/${managedMeeting.committee_id}/meetings/${managedMeeting.id}#meeting-participants-heading`}
                  >
                    Gennemgå deltagere
                  </Link>
                ) : null}
                <Link
                  className={buttonClassName({ size: "sm" })}
                  href={
                    managedMinutes
                      ? `${organizationRoot}/committees/${managedMinutes.committeeId}/meetings/${managedMinutes.meetingId}#minutes-approval`
                      : `${organizationRoot}/committees/${managedMeeting!.committee_id}/meetings/${managedMeeting!.id}`
                  }
                >
                  {managedMinutes ? "Gå til godkendelse" : "Forbered møde"}
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState
              action={
                managedCommittee ? (
                  <Link
                    className={buttonClassName({ size: "sm" })}
                    href={`${organizationRoot}/committees/${managedCommittee.committee.id}/meetings/new`}
                  >
                    Planlæg møde
                  </Link>
                ) : undefined
              }
              compact
              description="Du kan planlægge et møde i et udvalg, du leder."
              title="Der er intet kommende udvalgsmøde."
            />
          )
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {committeeByAttention.slice(0, 3).map((item) => {
              const attention =
                item.openTaskCount +
                item.activeDecisionCount +
                item.openFollowUpCount;
              return (
                <Link
                  className={interactiveSurfaceClassName("bg-surface p-4")}
                  href={`${organizationRoot}/committees/${item.committee.id}`}
                  key={item.committee.id}
                >
                  <span className="font-semibold">{item.committee.name}</span>
                  <p className="mt-1 text-sm text-muted">
                    {attention
                      ? `${attention} åbne opmærksomhedspunkter`
                      : "Ingen åbne opmærksomhedspunkter"}
                  </p>
                  <SurfaceLinkCue label="Åbn udvalg" />
                </Link>
              );
            })}
            {!committeeByAttention.length ? (
              <EmptyState
                compact
                description="Opret eller tilknyt et udvalg for at få driftsoversigt."
                title="Organisationen har ingen synlige udvalg."
              />
            ) : null}
          </div>
        )}
      </DashboardPriorityPanel>
    </div>
  );
}
