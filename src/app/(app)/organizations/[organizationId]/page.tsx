import Link from "next/link";
import { notFound } from "next/navigation";

import { OrganizationDashboardPriority } from "@/components/dashboard/organization-dashboard-priority";
import { TrashActionButton } from "@/components/trash/trash-action-button";
import {
  ActionMenu,
  EmptyState,
  PageHeader,
  StatusBadge,
  buttonClassName,
  staticSurfaceClassName,
} from "@/components/ui";
import { resolveOrganizationDashboardAudience } from "@/lib/dashboard-prioritization";
import { formatDateTime, meetingMinutesStatusLabels } from "@/lib/localization";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { OrganizationService } from "@/services/organization-service";
import { ActionService } from "@/services/action-service";

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db)
    .requireOrganizationMember(organizationId, user.id)
    .catch(() => null);
  if (!context) notFound();

  const [overview, actionCenter] = await Promise.all([
    new OrganizationService(db).getOverview(organizationId),
    new ActionService(db).getCenter(organizationId),
  ]);
  const canManage = ["owner", "admin"].includes(context.membership.role);
  const organizationRoot = `/organizations/${organizationId}`;
  const dashboardAudience = resolveOrganizationDashboardAudience(
    context.membership.role,
    overview.committees.map(({ capabilities }) => capabilities),
  );
  const meetingCommittee = overview.committees.find(
    ({ capabilities }) => capabilities.createMeeting,
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
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Navigation
          </p>
          <h2 className="mt-0.5 text-xl font-semibold" id="committees-title">
            Mine udvalg
          </h2>
        </div>
        {overview.committees.length > committeeHighlights.length ? (
          <Link
            className="text-sm font-semibold text-brand hover:underline"
            href={`${organizationRoot}/committees`}
          >
            Se alle udvalg
          </Link>
        ) : null}
      </div>

      {committeeHighlights.length ? (
        <div className={staticSurfaceClassName("divide-y divide-line")}>
          {committeeHighlights.map((item) => {
            const attention =
              item.openTaskCount +
              item.activeDecisionCount +
              item.openFollowUpCount;
            const committeeRoot = `${organizationRoot}/committees/${item.committee.id}`;
            return (
              <article key={item.committee.id}>
                <Link
                  className="group grid min-h-11 grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 px-3 py-1.5 transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
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
    <section
      aria-labelledby="recent-minutes-title"
      className="border-t border-line pt-2"
    >
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-x-3 gap-y-0.5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Referater
          </p>
          <h2
            className="mt-0.5 text-xl font-semibold"
            id="recent-minutes-title"
          >
            Seneste referater
          </h2>
        </div>
        <p className="text-sm text-muted">
          Senest opdaterede referater, du har adgang til.
        </p>
      </div>
      {recentActivity.length ? (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {recentActivity.map((minutes) => (
            <article key={minutes.id}>
              <Link
                className={staticSurfaceClassName(
                  "group grid min-h-11 gap-x-2 gap-y-0.5 px-2.5 py-1.5 transition hover:border-brand/45 hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                )}
                href={`${organizationRoot}/committees/${minutes.committeeId}/meetings/${minutes.meetingId}`}
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

  return (
    <div className="space-y-4 xl:space-y-2.5" data-organization-dashboard>
      <PageHeader
        className="xl:gap-2 xl:pb-2 [&_.page-lead]:mt-1 [&_.page-title]:mt-1"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {meetingCommittee ? (
              <Link
                className={buttonClassName({ size: "sm" })}
                href={`${organizationRoot}/committees/${meetingCommittee.committee.id}/meetings/new`}
              >
                Nyt møde
              </Link>
            ) : null}
            <Link
              className={buttonClassName({ size: "sm", variant: "secondary" })}
              href={`${organizationRoot}/meetings`}
            >
              Åbn kalender
            </Link>
            {canManage ? (
              <ActionMenu label="Indstillinger">
                <Link
                  className="block px-3 py-2 text-sm font-semibold text-ink transition hover:bg-background"
                  href={`${organizationRoot}/edit`}
                >
                  Rediger organisation
                </Link>
                <TrashActionButton
                  confirmMessage="Er du sikker på, at du vil flytte dette til papirkurven? Elementet kan gendannes i 30 dage."
                  endpoint={`/api/organizations/${organizationId}`}
                  label="Flyt til papirkurv"
                  pendingLabel="Flytter..."
                  redirectTo={`${organizationRoot}/trash`}
                />
              </ActionMenu>
            ) : null}
          </div>
        }
        description="Få overblik over møder, opgaver og beslutninger"
        eyebrow={
          <Link
            className="text-muted transition hover:text-brand"
            href="/organizations"
          >
            {context.organization.name}
          </Link>
        }
        title="Dashboard"
      />

      <OrganizationDashboardPriority
        actionCenter={actionCenter}
        committeeSection={committeeSection}
        organizationId={organizationId}
        organizationRole={context.membership.role}
        overview={overview}
        recentMinutesSection={recentMinutesSection}
      />

      {dashboardAudience !== "viewer" ? (
        <span className="sr-only">
          Skrivehandlinger følger dine udvalgscapabilities.
        </span>
      ) : null}
    </div>
  );
}
