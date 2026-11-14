import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionCenter } from "@/components/actions/action-center";
import { BestieRepository } from "@/repositories/bestie-repository";
import { bestiePath } from "@/lib/bestie";
import { OverviewCalendar } from "@/components/dashboard/overview-calendar";
import { overviewMonth } from "@/lib/overview-calendar";
import { OverviewCalendarRepository } from "@/repositories/overview-calendar-repository";
import { OverviewList } from "@/components/dashboard/overview-list";
import { AdvisoryAi } from "@/components/dashboard/advisory-ai";
import { OrganizationDashboardPriority } from "@/components/dashboard/organization-dashboard-priority";
import { EmptyState, StatusBadge } from "@/components/ui";
import { resolveOrganizationDashboardAudience } from "@/lib/dashboard-prioritization";
import { formatDateTime, meetingMinutesStatusLabels } from "@/lib/localization";
import { withMeetingReturnTo } from "@/lib/meeting-navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { OrganizationService } from "@/services/organization-service";
import { ActionService } from "@/services/action-service";

export default async function OrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ handlinger?: string; maaned?: string }>;
}) {
  const { organizationId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db)
    .requireOrganizationMember(organizationId, user.id)
    .catch(() => null);
  if (!context) notFound();

  const { handlinger, maaned } = await searchParams;
  const month = overviewMonth(maaned);
  const actionView = handlinger === "mine" || handlinger === "completed" ? handlinger : "inbox";
  const [overview, actionCenter, threads, notifications, calendar] = await Promise.all([
    new OrganizationService(db).getOverview(organizationId),
    new ActionService(db).getCenter(organizationId),
    new BestieRepository(db).list(organizationId, user.id),
    db.from("organization_notifications").select("id,path,title,created_at")
      .eq("organization_id", organizationId).eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(50),
    new OverviewCalendarRepository(db).list(organizationId, user.id, month),
  ]);
  const canManage = ["owner", "admin"].includes(context.membership.role);
  const organizationRoot = `/organizations/${organizationId}`;
  const dashboardAudience = resolveOrganizationDashboardAudience(
    context.membership.role,
    overview.committees.map(({ capabilities }) => capabilities),
  );
  const committeeHighlights = [...overview.committees]
    .sort((left, right) => {
      const leftAttention =
        left.openTaskCount + left.activeDecisionCount + left.openFollowUpCount;
      const rightAttention =
        right.openTaskCount +
        right.activeDecisionCount +
        right.openFollowUpCount;
      if (leftAttention !== rightAttention)
        return rightAttention - leftAttention;
      return left.committee.name.localeCompare(right.committee.name, "da");
    })
    .slice(0, 4);
  const recentActivity = [...overview.recentMinutes]
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    )
    .slice(0, 4);

  const committeeSection = (
    <section aria-labelledby="committees-title">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold" id="committees-title">
            Mine arbejdsrum
          </h2>
        </div>
        {overview.committees.length > committeeHighlights.length ? (
          <Link
            className="text-sm font-semibold text-brand hover:underline"
            href={`${organizationRoot}/committees`}
          >
            Se alle arbejdsrum
          </Link>
        ) : null}
      </div>

      {committeeHighlights.length ? (
        <div className={"grid gap-x-6 sm:grid-cols-2"}>
          {committeeHighlights.map((item) => {
            const attention =
              item.openTaskCount +
              item.activeDecisionCount +
              item.openFollowUpCount;
            const committeeRoot = `${organizationRoot}/committees/${item.committee.id}`;
            return (
              <article key={item.committee.id}>
                <Link
                  className="group grid min-h-11 grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 border-b border-line py-2 transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                  href={committeeRoot}
                >
                  <span className="break-words text-sm font-semibold leading-5 text-ink group-hover:text-brand group-hover:underline">
                    {item.committee.name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <StatusBadge tone={attention ? "warning" : "success"}>
                      {attention ? "Kræver handling" : "Roligt"}
                    </StatusBadge>
                    <span
                      aria-hidden="true"
                      className="font-semibold text-brand"
                    >
                      →
                    </span>
                  </span>
                  {attention || item.upcomingMeetingCount ? (
                    <span className="col-span-2 text-xs leading-4 text-muted">
                      <span className="font-semibold text-ink">
                        {item.openTaskCount}
                      </span>{" "}
                      opgaver ·{" "}
                      <span className="font-semibold text-ink">
                        {item.activeDecisionCount}
                      </span>{" "}
                      beslutninger ·{" "}
                      <span className="font-semibold text-ink">
                        {item.upcomingMeetingCount}
                      </span>{" "}
                      møder
                    </span>
                  ) : null}
                  {item.nextMeeting ? (
                    <span className="col-span-2 text-xs leading-4 text-muted">
                      Næste møde: {formatDateTime(item.nextMeeting.starts_at)}
                    </span>
                  ) : null}
                </Link>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          compact
          description={
            canManage
              ? "Opret organisationens første udvalg for at begynde at planlægge møder og fordele ansvar."
              : "Når du bliver tilknyttet et udvalg, får du en hurtig vej til dets arbejde her."
          }
          title="Du har ikke adgang til nogen udvalg endnu."
        />
      )}
    </section>
  );

  const recentMinutesSection = (
    <section aria-labelledby="recent-minutes-title" className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-x-3 gap-y-0.5">
        <div>
          <h2 className="text-lg font-semibold" id="recent-minutes-title">
            Hvad er der sket?
          </h2>
        </div>
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
          href={`${organizationRoot}/meetings`}
        >
          Alle referater →
        </Link>
      </div>
      <p className="mb-2 text-xs text-muted">
        Senest opdaterede referater · ikke filtreret efter dit sidste besøg.
      </p>
      {recentActivity.length > 0 && (
        <AdvisoryAi organizationId={organizationId} summary />
      )}
      {recentActivity.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recentActivity.slice(0, 3).map((minutes) => (
            <article key={minutes.id}>
              <Link
                className="group flex h-full min-h-11 flex-col items-start gap-2 border-b border-line py-3 transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                href={withMeetingReturnTo(
                  `${organizationRoot}/committees/${minutes.committeeId}/meetings/${minutes.meetingId}`,
                  organizationRoot,
                )}
              >
                <span className="min-w-0">
                  <span className="block text-xs leading-4 text-muted">
                    {minutes.committeeName}
                  </span>
                  <span className="block break-words text-sm font-semibold leading-5 text-ink group-hover:text-brand group-hover:underline">
                    {minutes.meetingTitle} <span aria-hidden="true">→</span>
                  </span>
                  <span className="block text-xs leading-4 text-muted">
                    Opdateret {formatDateTime(minutes.updatedAt)}
                  </span>
                </span>
                <StatusBadge
                  tone={
                    minutes.status === "approved"
                      ? "success"
                      : minutes.status === "ready_for_approval"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {meetingMinutesStatusLabels[minutes.status]}
                </StatusBadge>
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          description="Når et tilgængeligt referat bliver oprettet eller opdateret, vises det her."
          title="Der er ingen seneste referater endnu."
        />
      )}
    </section>
  );

  const messages = [
    ...threads.map(({ id, title, updated_at }) => ({ id, title, path: bestiePath(organizationId, id), created_at: updated_at })),
    ...(notifications.data ?? []),
  ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const actionCount = actionCenter.inbox.length + actionCenter.mine.length;
  const meeting = overview.upcomingMeetings[0];

  return (
    <div className="space-y-4 xl:space-y-2.5" data-organization-dashboard>
      <AdvisoryAi organizationId={organizationId} />

      <OrganizationDashboardPriority
        actionCount={actionCount}
        actionSection={<ActionCenter key={actionView} center={actionCenter} organizationId={organizationId} view={actionView} />}
        messageSection={<OverviewList empty="Ingen beskeder endnu." rows={messages.map((message) => ({
          id: message.id, title: message.title, href: message.path, date: message.created_at,
        }))} />}
        messageCount={messages.length}
        committeeCount={overview.committees.length}
        committeeSection={committeeSection}
        organizationId={organizationId}
        nextMeeting={
          meeting
            ? {
                id: meeting.id,
                committee_id: meeting.committee_id,
                starts_at: meeting.starts_at,
                title: meeting.title,
                committeeName: meeting.committeeName,
              }
            : null
        }
        recentMinutesSection={recentMinutesSection}
      />

      <OverviewCalendar
        key={month.first}
        month={month}
        entries={calendar}
        root={organizationRoot}
        actionView={actionView}
      />

      {dashboardAudience !== "viewer" ? (
        <span className="sr-only">
          Dine rettigheder i hvert udvalg afgør, hvad du kan ændre.
        </span>
      ) : null}
    </div>
  );
}
