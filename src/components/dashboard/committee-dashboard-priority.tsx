import Link from "next/link";

import { DashboardPriorityPanel } from "@/components/dashboard/dashboard-priority-panel";
import { MeetingAgendaPreview } from "@/components/meetings/meeting-agenda-preview";
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
  committeePriorityCopy,
  resolveCommitteeDashboardAudience,
} from "@/lib/dashboard-prioritization";
import { formatDateTime } from "@/lib/localization";
import type {
  CommitteeRole,
  MeetingCapabilities,
  OrganizationRole,
} from "@/lib/meeting-capabilities";
import type {
  CommitteeOverview,
  MeetingWithAgendaPreview,
} from "@/types/domain";

export function CommitteeDashboardPriority({
  capabilities,
  committeeRole,
  nextMeeting,
  organizationId,
  organizationRole,
  overview,
  root,
}: {
  capabilities: MeetingCapabilities;
  committeeRole: CommitteeRole | null;
  nextMeeting: MeetingWithAgendaPreview | null;
  organizationId: string;
  organizationRole: OrganizationRole;
  overview: CommitteeOverview;
  root: string;
}) {
  const audience = resolveCommitteeDashboardAudience(
    organizationRole,
    committeeRole,
    capabilities,
  );
  const copy = committeePriorityCopy[audience];
  const latestApprovedMinutes = overview.recentMinutes.find(
    (minutes) => minutes.status === "approved",
  );
  const approvalMinutes = overview.recentMinutes.find(
    (minutes) => minutes.status === "ready_for_approval",
  );

  return (
    <div data-dashboard-audience={audience}>
      <DashboardPriorityPanel
        action={
          audience === "member" ? (
            <Link
              className={buttonClassName({ size: "sm" })}
              href={`/organizations/${organizationId}/tasks/my`}
            >
              Åbn mine opgaver
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
                href={`${root}/meetings/${nextMeeting.id}`}
              >
                <span className="font-semibold">{nextMeeting.title}</span>
                <p className="mt-1 text-sm text-muted">
                  {formatDateTime(nextMeeting.starts_at)}
                </p>
                <SurfaceLinkCue label="Åbn møde" />
              </Link>
            ) : (
              <EmptyState
                action={
                  <Link
                    className={buttonClassName({
                      size: "sm",
                      variant: "secondary",
                    })}
                    href={`${root}/meetings`}
                  >
                    Se mødeoversigt
                  </Link>
                }
                compact
                description="Når udvalget planlægger et møde, vises det her."
                title="Der er intet kommende møde at læse."
              />
            )}
            {latestApprovedMinutes ? (
              <Link
                className={interactiveSurfaceClassName("bg-surface p-4")}
                href={`${root}/meetings/${latestApprovedMinutes.meetingId}`}
              >
                <span className="font-semibold">Seneste godkendte referat</span>
                <p className="mt-1 text-sm text-muted">
                  {latestApprovedMinutes.meetingTitle} ·{" "}
                  {formatDateTime(latestApprovedMinutes.meetingStartsAt)}
                </p>
                <SurfaceLinkCue label="Læs referat" />
              </Link>
            ) : (
              <EmptyState
                action={
                  <Link
                    className={buttonClassName({
                      size: "sm",
                      variant: "secondary",
                    })}
                    href={`${root}/meetings`}
                  >
                    Se referatoversigt
                  </Link>
                }
                compact
                description="Godkendte referater vises her, når de er tilgængelige."
                title="Der er intet godkendt referat endnu."
              />
            )}
          </div>
        ) : audience === "member" ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold">Mine åbne opgaver</p>
              {overview.myOpenTasks.length ? (
                <RelatedTasks
                  compact
                  organizationId={organizationId}
                  tasks={overview.myOpenTasks}
                />
              ) : (
                <EmptyState
                  action={
                    <Link
                      className={buttonClassName({
                        size: "sm",
                        variant: "secondary",
                      })}
                      href={`/organizations/${organizationId}/tasks/my`}
                    >
                      Se mine opgaver
                    </Link>
                  }
                  compact
                  description="Der vises kun opgaver i dette udvalg, som er tildelt dig."
                  title="Du har ingen åbne opgaver her."
                />
              )}
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Aktive beslutninger</p>
              {overview.activeDecisions.length ? (
                <RelatedDecisions
                  compact
                  decisions={overview.activeDecisions}
                  organizationId={organizationId}
                />
              ) : (
                <EmptyState
                  action={
                    <Link
                      className={buttonClassName({
                        size: "sm",
                        variant: "secondary",
                      })}
                      href={`/organizations/${organizationId}/decisions`}
                    >
                      Se beslutningsregister
                    </Link>
                  }
                  compact
                  description="Beslutninger vises, når de er aktive og tilgængelige for dig."
                  title="Der er ingen aktive beslutninger."
                />
              )}
            </div>
          </div>
        ) : nextMeeting || approvalMinutes ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div>
              <p className="text-lg font-semibold">
                {approvalMinutes?.meetingTitle ?? nextMeeting?.title}
              </p>
              <p className="mt-1 text-sm text-muted">
                {approvalMinutes
                  ? formatDateTime(approvalMinutes.meetingStartsAt)
                  : formatDateTime(nextMeeting!.starts_at)}
                {nextMeeting?.location ? ` · ${nextMeeting.location}` : ""}
              </p>
              {nextMeeting ? (
                <MeetingAgendaPreview
                  occurrences={nextMeeting.agenda_item_occurrences}
                />
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {nextMeeting ? (
                  <StatusBadge>
                    {nextMeeting.agenda_item_occurrences.length} punkter
                  </StatusBadge>
                ) : null}
                <StatusBadge>
                  {overview.members.length} udvalgsmedlemmer
                </StatusBadge>
                {approvalMinutes ? (
                  <StatusBadge tone="warning">
                    Referat afventer godkendelse
                  </StatusBadge>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-64 lg:justify-end">
              {capabilities.manageParticipants && nextMeeting ? (
                <Link
                  className={buttonClassName({
                    size: "sm",
                    variant: "secondary",
                  })}
                  href={`${root}/meetings/${nextMeeting.id}#meeting-participants-heading`}
                >
                  Gennemgå deltagere
                </Link>
              ) : null}
              <Link
                className={buttonClassName({ size: "sm" })}
                href={
                  approvalMinutes
                    ? `${root}/meetings/${approvalMinutes.meetingId}#minutes-approval`
                    : `${root}/meetings/${nextMeeting!.id}`
                }
              >
                {approvalMinutes ? "Gå til godkendelse" : "Forbered møde"}
              </Link>
            </div>
          </div>
        ) : (
          <EmptyState
            action={
              capabilities.createMeeting ? (
                <Link
                  className={buttonClassName({ size: "sm" })}
                  href={`${root}/meetings/new`}
                >
                  Planlæg møde
                </Link>
              ) : undefined
            }
            compact
            description={
              capabilities.createMeeting
                ? "Planlæg et møde for at starte dagsorden og deltagerforberedelse."
                : "Når et møde bliver planlagt, vises det her."
            }
            title="Der er intet kommende møde."
          />
        )}
      </DashboardPriorityPanel>
    </div>
  );
}
