import Link from "next/link";
import type { ReactNode } from "react";
import { AppIcon } from "@/components/icons/app-icon";
import { StatusBadge, interactiveSurfaceClassName } from "@/components/ui";
import type { OrganizationRole } from "@/lib/meeting-capabilities";
import type { ActionCenterData, OrganizationOverview } from "@/types/domain";

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
  const root = `/organizations/${organizationId}`;
  const allActions = [...actionCenter.inbox, ...actionCenter.mine];
  const actions = allActions.slice(0, 3);
  const nextMeeting = overview.upcomingMeetings[0];
  return (
    <div className="space-y-5" data-dashboard-layout="compact-cards">
      <section aria-labelledby="dashboard-priority-title">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3">
          <h2 id="dashboard-priority-title" className="text-lg font-semibold">
            Hvad mangler jeg at lave?
          </h2>
          <Link
            className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
            href={`${root}/actions`}
          >
            Alle handlinger{allActions.length ? ` (${allActions.length})` : ""}{" "}
            →
          </Link>
        </div>
        {actions.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {actions.map((action) => (
              <Link
                key={action.key}
                href={`${root}${action.href}`}
                className={interactiveSurfaceClassName(
                  "group flex min-w-0 flex-col gap-2 p-3",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge
                    tone={
                      action.priority === "critical"
                        ? "danger"
                        : action.priority === "soon"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {action.priority === "critical"
                      ? "Kræver handling"
                      : action.priority === "soon"
                        ? "Snart"
                        : "Opfølgning"}
                  </StatusBadge>
                  <AppIcon
                    name={
                      action.sourceType === "meeting_minutes"
                        ? "preparation"
                        : "tasks"
                    }
                    size={16}
                  />
                </div>
                <h3 className="break-words text-sm font-semibold leading-5 group-hover:underline">
                  {action.title}
                </h3>
                <p className="text-xs leading-4 text-muted">
                  {action.description}
                </p>
                <div className="mt-auto flex items-end justify-between gap-2 text-xs text-muted">
                  <span>{action.context}</span>
                  <span aria-hidden="true" className="text-base text-brand">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-[var(--radius-panel)] border border-line bg-surface px-4 py-3 text-sm text-muted">
            {organizationRole === "viewer"
              ? "Du har læseadgang. Følg med i nyt og kommende møder nedenfor."
              : "Ingen aktuelle handlinger kræver din opmærksomhed."}
          </p>
        )}
        {organizationRole !== "viewer" ? (
          <Link
            href={`${root}/tasks/my`}
            className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-brand hover:underline"
          >
            Mine øvrige opgaver →
          </Link>
        ) : null}
      </section>
      {recentMinutesSection}
      <section aria-label="Næste møde" className="border-y border-line py-3">
        {nextMeeting ? (
          <Link
            href={`${root}/committees/${nextMeeting.committee_id}/meetings/${nextMeeting.id}`}
            className="group flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-control)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-muted">
              <AppIcon name="calendar" size={17} />
              Næste møde
            </span>
            <span className="text-sm font-semibold group-hover:underline">
              {nextMeeting.title}
            </span>
            <span className="text-xs text-muted">
              {new Intl.DateTimeFormat("da-DK", {
                timeZone: "Europe/Copenhagen",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(nextMeeting.starts_at))}{" "}
              · {nextMeeting.committeeName}
            </span>
            <span className="ml-auto text-xs font-semibold text-brand">
              Se dagsorden →
            </span>
          </Link>
        ) : (
          <Link
            href={`${root}/meetings`}
            className="inline-flex min-h-11 items-center gap-3 text-sm text-muted"
          >
            Ingen kommende møder · Åbn kalender →
          </Link>
        )}
      </section>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer py-2 font-semibold text-muted">
          Dine udvalg ({overview.committees.length})
        </summary>
        <div className="pt-2">{committeeSection}</div>
      </details>
    </div>
  );
}
