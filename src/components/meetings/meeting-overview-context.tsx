import Link from "next/link";

import { AppIcon } from "@/components/icons/app-icon";
import { StatusBadge } from "@/components/ui";
import { formatDateTime, meetingMinutesStatusLabels } from "@/lib/localization";
import type { MeetingListEntry } from "@/components/meetings/meeting-list";
import type { OrganizationOverview } from "@/types/domain";

type RecentMinutes = OrganizationOverview["recentMinutes"][number];

export function MeetingOverviewContext({
  nextMeeting,
  recentMinutes,
  myOpenTaskCount,
  pendingApprovalCount,
  followUpCount,
  organizationId,
}: {
  nextMeeting: MeetingListEntry | null;
  recentMinutes: RecentMinutes | null;
  myOpenTaskCount: number;
  pendingApprovalCount: number;
  followUpCount: number;
  organizationId: string;
}) {
  const organizationRoot = `/organizations/${organizationId}`;
  const actionCount = myOpenTaskCount + pendingApprovalCount + followUpCount;

  return (
    <aside
      className="space-y-1.5 xl:sticky xl:top-16"
      aria-label="Mødekontekst"
    >
      <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <AppIcon className="text-brand" name="calendar" size={16} />
          Næste møde
        </h2>
        {nextMeeting ? (
          <div className="mt-1.5 min-w-0">
            <p className="break-words text-sm font-semibold text-ink">
              {nextMeeting.title}
            </p>
            <p className="mt-0.5 break-words text-xs text-muted">
              {nextMeeting.committeeName}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {formatDateTime(nextMeeting.starts_at, "full")}
            </p>
            <Link
              className="mt-1 inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-control)] text-xs font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              href={`${organizationRoot}/committees/${nextMeeting.committee_id}/meetings/${nextMeeting.id}`}
            >
              Gå til møde
              <AppIcon name="arrowRight" size={14} />
            </Link>
          </div>
        ) : (
          <p className="mt-1.5 text-xs leading-5 text-muted">
            Ingen kommende møder. Der er ingen planlagte møder lige nu.
          </p>
        )}
      </section>

      <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <AppIcon className="text-warning" name="pending" size={16} />
            Kræver handling
          </h2>
          {actionCount > 0 ? (
            <StatusBadge tone="warning">{actionCount}</StatusBadge>
          ) : null}
        </div>
        {actionCount > 0 ? (
          <dl className="mt-1.5 divide-y divide-line/70 border-y border-line/70 text-xs">
            {pendingApprovalCount > 0 ? (
              <div className="flex items-center justify-between gap-3 py-1.5">
                <dt className="text-muted">Referater til godkendelse</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {pendingApprovalCount}
                </dd>
              </div>
            ) : null}
            {followUpCount > 0 ? (
              <div className="flex items-center justify-between gap-3 py-1.5">
                <dt className="text-muted">Mødepunkter til opfølgning</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {followUpCount}
                </dd>
              </div>
            ) : null}
            {myOpenTaskCount > 0 ? (
              <div className="flex items-center justify-between gap-3 py-1.5">
                <dt className="text-muted">Mine opgaver</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {myOpenTaskCount}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="mt-1.5 text-xs text-muted">
            Intet kræver din handling lige nu.
          </p>
        )}
        <Link
          className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          href={`${organizationRoot}/tasks/my`}
        >
          Se mine opgaver
          <AppIcon name="arrowRight" size={14} />
        </Link>
      </section>

      <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <AppIcon className="text-muted" name="notes" size={16} />
          Hurtig adgang
        </h2>
        <div className="mt-1.5 divide-y divide-line/70 border-y border-line/70">
          {recentMinutes ? (
            <Link
              className="block min-w-0 py-1.5 text-xs hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              href={`${organizationRoot}/committees/${recentMinutes.committeeId}/meetings/${recentMinutes.meetingId}#general-minutes-heading`}
            >
              <span className="block break-words font-semibold text-ink">
                Seneste referat
              </span>
              <span className="mt-0.5 block break-words text-muted">
                {recentMinutes.meetingTitle} ·{" "}
                {meetingMinutesStatusLabels[recentMinutes.status]}
              </span>
            </Link>
          ) : null}
          <Link
            className="flex min-h-9 items-center justify-between gap-2 py-1.5 text-xs font-semibold text-ink hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            href={`${organizationRoot}/tasks/my`}
          >
            Mine opgaver
            <AppIcon name="arrowRight" size={14} />
          </Link>
        </div>
      </section>
    </aside>
  );
}
