import Link from "next/link";
import type { ReactNode } from "react";

import { DashboardPriorityPanel } from "@/components/dashboard/dashboard-priority-panel";
import { AppIcon, type AppIconName } from "@/components/icons/app-icon";
import {
  EmptyState,
  StatusBadge,
  buttonClassName,
  interactiveSurfaceClassName,
  staticSurfaceClassName,
} from "@/components/ui";
import {
  organizationPriorityCopy,
  resolveOrganizationDashboardAudience,
} from "@/lib/dashboard-prioritization";
import type { OrganizationRole } from "@/lib/meeting-capabilities";
import type {
  ActionCenterData,
  ActionItem,
  OrganizationOverview,
} from "@/types/domain";

type DashboardGlyphName = Extract<
  AppIconName,
  "agenda" | "calendar" | "decisions" | "preparation" | "tasks" | "stakeholders"
>;

function DashboardGlyph({
  name,
  compact = false,
}: {
  name: DashboardGlyphName;
  compact?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={
        compact
          ? "inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand"
          : "inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-brand/10 bg-brand-soft text-base font-bold text-brand"
      }
    >
      <AppIcon
        name={name}
        size={compact ? 15 : 18}
        strokeWidth={compact ? 2 : 1.9}
      />
    </span>
  );
}

function DashboardCardCue({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2.5 py-1 text-xs font-semibold text-brand transition group-hover:border-brand/45 group-hover:bg-brand-soft/45"
    >
      {label} <span>→</span>
    </span>
  );
}

function formatMeetingDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatMeetingTime(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function actionHref(action: ActionItem, organizationRoot: string) {
  return `${organizationRoot}${action.href}`;
}

export function OrganizationDashboardPriority({
  actionCenter,
  committeeSection,
  organizationId,
  organizationRole,
  overview,
  recentMinutesSection,
}: {
  actionCenter: ActionCenterData;
  committeeSection: ReactNode;
  organizationId: string;
  organizationRole: OrganizationRole;
  overview: OrganizationOverview;
  recentMinutesSection: ReactNode;
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

  const relevantTasks =
    audience === "admin"
      ? overview.openTasks
      : audience === "viewer"
        ? []
        : overview.myOpenTasks;
  const dueThisWeek = relevantTasks.filter((task) => {
    if (!task.deadline) return false;
    const days =
      (new Date(`${task.deadline}T00:00:00`).getTime() - Date.now()) /
      86_400_000;
    return days >= 0 && days <= 7;
  }).length;
  const relevantTaskCount =
    audience === "admin"
      ? overview.metrics.openTaskCount
      : audience === "viewer"
        ? 0
        : overview.metrics.myOpenTaskCount;
  const decisionCount =
    audience === "viewer" ? 0 : overview.metrics.activeDecisionCount;

  const actions = [...actionCenter.inbox, ...actionCenter.mine].slice(0, 6);

  const preparationCount = overview.pendingMinutesApprovals.length;
  const allActionsHref = `${organizationRoot}/actions`;

  return (
    <div className="space-y-3 xl:space-y-2" data-dashboard-audience={audience}>
      <section
        aria-label="Status"
        className="grid gap-2 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-4"
      >
        {nextMeeting ? (
          <Link
            className={interactiveSurfaceClassName(
              "order-1 flex min-h-36 flex-col justify-between p-2.5 xl:min-h-32",
            )}
            href={`${organizationRoot}/committees/${nextMeeting.committee_id}/meetings/${nextMeeting.id}`}
          >
            <div>
              <div className="flex items-center gap-2">
                <DashboardGlyph name="calendar" />
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Næste møde
                </p>
              </div>
              <p className="mt-1.5 text-lg font-semibold leading-5">
                {nextMeeting.title}
              </p>
              <p className="mt-0.5 text-sm leading-5 text-muted">
                {formatMeetingDate(nextMeeting.starts_at)} ·{" "}
                {formatMeetingTime(nextMeeting.starts_at)}
              </p>
              <p className="text-sm leading-5 text-muted">
                {nextMeeting.committeeName}
              </p>
            </div>
            <DashboardCardCue label="Se dagsorden" />
          </Link>
        ) : (
          <div
            className={staticSurfaceClassName(
              "order-1 p-2.5 sm:min-h-36 xl:min-h-32",
            )}
          >
            <div className="flex items-center gap-2">
              <DashboardGlyph name="calendar" />
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Næste møde
              </p>
            </div>
            <p className="mt-1.5 font-semibold">Ingen kommende møder</p>
            <Link
              className={buttonClassName({
                size: "sm",
                variant: "secondary",
                className: "mt-1.5",
              })}
              href={`${organizationRoot}/meetings`}
            >
              Se kommende møder
            </Link>
          </div>
        )}

        <Link
          className={interactiveSurfaceClassName(
            "order-2 flex min-h-36 flex-col justify-between p-2.5 xl:min-h-32",
          )}
          href={
            audience === "member" || audience === "chair"
              ? `${organizationRoot}/tasks/my`
              : `${organizationRoot}/tasks`
          }
        >
          <div>
            <div className="flex items-center gap-2">
              <DashboardGlyph name="tasks" />
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Mine opgaver
              </p>
            </div>
            <p className="mt-1.5 text-3xl font-semibold leading-none tabular-nums">
              {relevantTaskCount}
            </p>
            <p className="mt-0.5 text-sm leading-5 text-muted">
              {dueThisWeek
                ? `${dueThisWeek} med frist denne uge`
                : relevantTaskCount > relevantTasks.length
                  ? "Se prioriterede opgaver"
                  : "Ingen frister denne uge"}
            </p>
          </div>
          <DashboardCardCue
            label={
              audience === "member" || audience === "chair"
                ? "Åbn mine opgaver"
                : "Se opgaver"
            }
          />
        </Link>

        <Link
          className={interactiveSurfaceClassName(
            "order-3 flex min-h-36 flex-col justify-between p-2.5 xl:min-h-32",
          )}
          href={`${organizationRoot}/decisions`}
        >
          <div>
            <div className="flex items-center gap-2">
              <DashboardGlyph name="decisions" />
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Beslutninger
              </p>
            </div>
            <p className="mt-1.5 text-3xl font-semibold leading-none tabular-nums">
              {decisionCount}
            </p>
            <p className="mt-0.5 text-sm leading-5 text-muted">
              {decisionCount
                ? "aktive eller afventende"
                : "Ingen kræver handling"}
            </p>
          </div>
          <DashboardCardCue label="Se beslutninger" />
        </Link>

        <Link
          className={interactiveSurfaceClassName(
            "order-4 flex min-h-36 flex-col justify-between p-2.5 xl:min-h-32",
          )}
          href={
            managedMinutes
              ? `${organizationRoot}/committees/${managedMinutes.committeeId}/meetings/${managedMinutes.meetingId}#minutes-approval`
              : managedMeeting
                ? `${organizationRoot}/committees/${managedMeeting.committee_id}/meetings/${managedMeeting.id}`
                : `${organizationRoot}/meetings`
          }
        >
          <div>
            <div className="flex items-center gap-2">
              <DashboardGlyph name="preparation" />
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Mødeforberedelse
              </p>
            </div>
            <p className="mt-1.5 text-3xl font-semibold leading-none tabular-nums">
              {preparationCount}
            </p>
            <p className="mt-0.5 text-sm leading-5 text-muted">
              {preparationCount
                ? "referater afventer din godkendelse"
                : nextMeeting
                  ? `${nextMeeting.agenda_item_occurrences.length} punkter på næste dagsorden`
                  : "Intet afventer"}
            </p>
          </div>
          <DashboardCardCue
            label={managedMinutes ? "Gå til godkendelse" : "Åbn mødeoversigt"}
          />
        </Link>
      </section>

      <div className="grid items-start gap-2 xl:grid-cols-[minmax(0,1.9fr)_minmax(20rem,1fr)]">
        <div className="contents xl:block xl:space-y-2">
          <div className="order-1">
            <DashboardPriorityPanel
              action={
                actions.length ? (
                  <Link
                    className={buttonClassName({
                      size: "sm",
                      variant: "secondary",
                    })}
                    href={allActionsHref}
                  >
                    Se alle
                  </Link>
                ) : null
              }
              description="De vigtigste konkrete handlinger på tværs af dine udvalg."
              eyebrow="Prioriteret"
              title="Kræver handling nu"
              variant="card"
            >
              {actions.length ? (
                <div className="divide-y divide-line border-y border-line">
                  {actions.map((action) => {
                    const href = actionHref(action, organizationRoot);
                    const glyphName: DashboardGlyphName =
                      action.sourceType === "task"
                        ? "tasks"
                        : action.sourceType.startsWith("stakeholder")
                          ? "stakeholders"
                        : action.sourceType === "meeting_minutes"
                          ? "preparation"
                          : "calendar";
                    return (
                      <article key={action.key}>
                        <Link
                          className="group grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-[var(--radius-control)] px-1 py-1 transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
                          href={href}
                        >
                          <DashboardGlyph compact name={glyphName} />
                          <span className="min-w-0">
                            <span className="block break-words text-sm font-semibold leading-5 text-ink group-hover:text-brand group-hover:underline">
                              {action.title}
                            </span>
                            <span className="block text-xs leading-4 text-muted">
                              {action.context}
                            </span>
                          </span>
                          <span className="col-span-2 col-start-2 flex flex-wrap items-center gap-1.5 sm:col-span-1 sm:col-start-auto sm:justify-end">
                            <StatusBadge
                              tone={
                                action.priority === "critical"
                                  ? "danger"
                                  : action.priority === "soon"
                                    ? "warning"
                                    : action.priority === "follow_up"
                                      ? "info"
                                      : "neutral"
                              }
                            >
                              {action.priority === "critical"
                                ? "Kritisk"
                                : action.priority === "soon"
                                  ? "Snart"
                                  : "Opfølgning"}
                            </StatusBadge>
                            <span className="text-xs text-muted">
                              {action.description}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className="col-start-3 row-start-1 text-base font-semibold text-brand transition-transform group-hover:translate-x-0.5 sm:col-start-auto sm:row-start-auto"
                          >
                            →
                          </span>
                        </Link>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  compact
                  description={
                    audience === "viewer"
                      ? "Du har læseadgang; kommende møder og godkendte referater vises fortsat nedenfor."
                      : "Der er ingen frister, beslutninger eller opfølgningspunkter, som kræver din opmærksomhed."
                  }
                  title="Ingen handlinger kræver din opmærksomhed lige nu."
                />
              )}
              <span className="sr-only">{copy.title}</span>
            </DashboardPriorityPanel>
          </div>

          <div className="order-4">{recentMinutesSection}</div>
        </div>

        <div className="contents xl:block xl:space-y-2">
          <section
            aria-labelledby="upcoming-meetings-title"
            className={staticSurfaceClassName("order-2 p-2.5 sm:p-3")}
          >
            <div className="flex items-end justify-between gap-3 border-b border-line pb-1.5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Kalender
                </p>
                <h2
                  className="mt-0.5 text-xl font-semibold"
                  id="upcoming-meetings-title"
                >
                  Næste møder
                </h2>
              </div>
              <Link
                className="text-sm font-semibold text-brand hover:underline"
                href={`${organizationRoot}/meetings`}
              >
                Se kalender
              </Link>
            </div>
            {overview.upcomingMeetings.length ? (
              <div className="divide-y divide-line">
                {overview.upcomingMeetings.slice(0, 4).map((meeting) => (
                  <article key={meeting.id}>
                    <Link
                      className="group grid min-h-11 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[var(--radius-control)] py-1 transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                      href={`${organizationRoot}/committees/${meeting.committee_id}/meetings/${meeting.id}`}
                    >
                      <time
                        className="text-center"
                        dateTime={meeting.starts_at}
                      >
                        <span className="block text-lg font-semibold leading-none">
                          {new Intl.DateTimeFormat("da-DK", {
                            day: "2-digit",
                          }).format(new Date(meeting.starts_at))}
                        </span>
                        <span className="mt-0.5 block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
                          {new Intl.DateTimeFormat("da-DK", {
                            month: "short",
                          }).format(new Date(meeting.starts_at))}
                        </span>
                      </time>
                      <span className="min-w-0">
                        <span className="block text-xs leading-4 text-muted">
                          {meeting.committeeName}
                        </span>
                        <span className="block break-words text-sm font-semibold leading-5 group-hover:text-brand group-hover:underline">
                          {meeting.title}
                        </span>
                        <span className="block text-xs leading-4 text-muted">
                          {formatMeetingTime(meeting.starts_at)}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
                        <span className="hidden 2xl:inline">Se dagsorden</span>
                        <span aria-hidden="true">→</span>
                      </span>
                    </Link>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                description="Planlagte møder fra dine udvalg vises her."
                title="Du har ingen kommende møder."
              />
            )}
          </section>

          <div className="order-3">{committeeSection}</div>
        </div>
      </div>

      {audience === "viewer" && latestApprovedMinutes ? (
        <span className="sr-only">Seneste godkendte referat · Læs referat</span>
      ) : null}
      {managedMeeting || managedMinutes ? (
        <span className="sr-only">
          meeting-participants-heading minutes-approval
        </span>
      ) : null}
      {audience === "admin" ? (
        <span className="sr-only">Opret første udvalg</span>
      ) : null}
    </div>
  );
}
