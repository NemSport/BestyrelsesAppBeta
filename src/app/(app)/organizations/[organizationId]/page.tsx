import Link from "next/link";
import { notFound } from "next/navigation";

import { AgendaItemDocumentTitle } from "@/components/agenda-items/agenda-item-document-title";
import { ResourceForm } from "@/components/forms/resource-form";
import { OrganizationNav } from "@/components/layout/organization-nav";
import { RelatedDecisions } from "@/components/decisions/related-decisions";
import { RelatedTasks } from "@/components/tasks/related-tasks";
import {
  ContentPanel,
  EmptyState,
  PageHeader,
  PageSection,
  StatusBadge,
  buttonClassName,
  type StatusTone,
} from "@/components/ui";
import {
  agendaItemMinutesStatusLabels,
  formatDateTime,
  meetingMinutesStatusLabels,
  meetingStatusLabels,
  transferredAgendaItemStatusLabels,
} from "@/lib/localization";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { OrganizationService } from "@/services/organization-service";
import type { OrganizationOverviewActionItem } from "@/types/domain";

const minutesStatusTones = {
  draft: "neutral",
  ready_for_approval: "warning",
  approved: "success",
} as const satisfies Record<string, StatusTone>;

const meetingStatusTones = {
  draft: "neutral",
  scheduled: "info",
  in_progress: "progress",
  completed: "success",
  cancelled: "danger",
} as const satisfies Record<string, StatusTone>;

function getActionStatus(item: OrganizationOverviewActionItem) {
  if (item.kind === "transfer") {
    return transferredAgendaItemStatusLabels[item.status as
      | "pending"
      | "scheduled"
      | "dismissed"];
  }
  return agendaItemMinutesStatusLabels[item.status as keyof typeof agendaItemMinutesStatusLabels];
}

function getActionLabel(item: OrganizationOverviewActionItem) {
  if (item.kind === "follow_up") return "Åbent opfølgningspunkt";
  if (item.kind === "decision") return "Kræver beslutning";
  return "Overført punkt";
}

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

  const overview = await new OrganizationService(db).getOverview(organizationId);
  const canManage = ["owner", "admin"].includes(context.membership.role);
  const organizationRoot = `/organizations/${organizationId}`;

  return (
    <div>
      <OrganizationNav organizationId={organizationId} />
      <div className="section-stack">
        <div>
          <Link
            className="text-sm text-muted transition hover:text-brand"
            href="/organizations"
          >
            ← Organisationer
          </Link>
          <PageHeader
            actions={
              canManage ? (
                <Link
                  className={buttonClassName({ variant: "secondary" })}
                  href={`${organizationRoot}/edit`}
                >
                  Rediger organisation
                </Link>
              ) : null
            }
            className="mt-3"
            description="Få overblik over udvalg, kommende møder, referater og punkter, der kræver handling på tværs af organisationen."
            eyebrow="Organisation"
            title={context.organization.name}
          />
        </div>

        <div className="grid divide-y divide-line border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            ["Udvalg", overview.metrics.committeeCount],
            ["Kommende møder", overview.metrics.upcomingMeetingCount],
            ["Mine åbne opgaver", overview.metrics.myOpenTaskCount],
          ].map(([label, value]) => (
            <div className="px-1 py-4 sm:px-4" key={label}>
              <p className="metadata">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <PageSection
          description="Det vigtigste arbejde, der kræver opmærksomhed lige nu."
          eyebrow="Genveje"
          title="Arbejde og ansvar"
        >
          <div className="grid divide-y divide-line border-y border-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            <section className="py-4 lg:pr-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Mine opgaver</h3>
                  <p className="text-xs text-muted">
                    {overview.metrics.myOpenTaskCount} åbne
                  </p>
                </div>
                <Link
                  className="text-sm font-semibold text-brand hover:underline"
                  href={`${organizationRoot}/tasks/my`}
                >
                  Se alle
                </Link>
              </div>
              {overview.myOpenTasks.length ? (
                <RelatedTasks
                  compact
                  organizationId={organizationId}
                  tasks={overview.myOpenTasks}
                />
              ) : (
                <EmptyState compact title="Du har ingen åbne opgaver." />
              )}
            </section>
            <section className="py-4 lg:px-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Åbne tasks</h3>
                  <p className="text-xs text-muted">
                    {overview.metrics.openTaskCount} på tværs af udvalg
                  </p>
                </div>
                <Link
                  className="text-sm font-semibold text-brand hover:underline"
                  href={`${organizationRoot}/tasks`}
                >
                  Task View
                </Link>
              </div>
              {overview.openTasks.length ? (
                <RelatedTasks
                  compact
                  organizationId={organizationId}
                  tasks={overview.openTasks}
                />
              ) : (
                <EmptyState compact title="Der er ingen åbne tasks." />
              )}
            </section>
            <section className="py-4 lg:pl-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Aktive beslutninger</h3>
                  <p className="text-xs text-muted">
                    {overview.metrics.activeDecisionCount} aktive
                  </p>
                </div>
                <Link
                  className="text-sm font-semibold text-brand hover:underline"
                  href={`${organizationRoot}/decisions`}
                >
                  Se register
                </Link>
              </div>
              {overview.activeDecisions.length ? (
                <RelatedDecisions
                  compact
                  decisions={overview.activeDecisions}
                  organizationId={organizationId}
                />
              ) : (
                <EmptyState compact title="Der er ingen aktive beslutninger." />
              )}
            </section>
          </div>
        </PageSection>

        <PageSection
          description="Organisationens arbejdsudvalg med deres nærmeste møde og aktuelle opfølgning."
          title="Udvalg"
        >
          <div
            className={
              canManage
                ? "grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]"
                : undefined
            }
          >
            {overview.committees.length > 0 ? (
              <div className="divide-y divide-line border-y border-line">
                {overview.committees.map(
                  ({
                    committee,
                    nextMeeting,
                    upcomingMeetingCount,
                    openFollowUpCount,
                  }) => {
                    const committeeRoot = `${organizationRoot}/committees/${committee.id}`;
                    return (
                      <article className="py-4" key={committee.id}>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-lg font-semibold">
                              {committee.name}
                            </h3>
                            <p className="mt-1 max-w-2xl text-sm text-muted">
                              {committee.description ||
                                "Der er endnu ingen beskrivelse."}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                              <span>
                                Næste møde:{" "}
                                {nextMeeting
                                  ? formatDateTime(nextMeeting.starts_at)
                                  : "Ikke planlagt"}
                              </span>
                              <span>
                                {upcomingMeetingCount}{" "}
                                {upcomingMeetingCount === 1
                                  ? "kommende møde"
                                  : "kommende møder"}
                              </span>
                              <span>
                                {openFollowUpCount}{" "}
                                {openFollowUpCount === 1
                                  ? "åbent opfølgningspunkt"
                                  : "åbne opfølgningspunkter"}
                              </span>
                            </div>
                          </div>
                          <Link
                            className={buttonClassName({
                              variant: "secondary",
                              size: "sm",
                            })}
                            href={committeeRoot}
                          >
                            Åbn udvalg
                          </Link>
                        </div>
                      </article>
                    );
                  },
                )}
              </div>
            ) : (
              <EmptyState title="Der er endnu ikke oprettet udvalg i organisationen." />
            )}

            {canManage ? (
              <ContentPanel className="h-fit p-5">
                <h3 className="text-lg font-semibold">Nyt udvalg</h3>
                <p className="mt-1 text-sm text-muted">
                  Opret et arbejdsrum til udvalgets møder og dagsordenspunkter.
                </p>
                <div className="mt-5">
                  <ResourceForm
                    endpoint={`/api/organizations/${organizationId}/committees`}
                    fields={[
                      {
                        name: "name",
                        label: "Udvalgsnavn",
                        required: true,
                        requiredMessage: "Udvalgsnavn skal udfyldes",
                      },
                      {
                        name: "description",
                        label: "Beskrivelse",
                        type: "textarea",
                      },
                    ]}
                    hidden={{ organizationId }}
                    successPath={`${organizationRoot}/committees/:id`}
                    submitLabel="Opret udvalg"
                  />
                </div>
              </ContentPanel>
            ) : null}
          </div>
        </PageSection>

        <div className="grid gap-8 lg:grid-cols-2">
          <PageSection
            className="scroll-mt-24"
            description="De næste planlagte møder i de udvalg, du har adgang til."
            id="kommende-moeder"
            title="Kommende møder"
          >
            {overview.upcomingMeetings.length > 0 ? (
              <div className="divide-y divide-line border-y border-line">
                {overview.upcomingMeetings.map((meeting) => (
                  <article
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                    key={meeting.id}
                  >
                    <div className="min-w-0">
                      <Link
                        className="font-semibold hover:text-brand hover:underline"
                        href={`${organizationRoot}/committees/${meeting.committee_id}/meetings/${meeting.id}`}
                      >
                        {meeting.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatDateTime(meeting.starts_at)} ·{" "}
                        {meeting.committeeName} ·{" "}
                        {meeting.agenda_item_occurrences.length}{" "}
                        {meeting.agenda_item_occurrences.length === 1
                          ? "punkt"
                          : "punkter"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge tone={meetingStatusTones[meeting.status]}>
                        {meetingStatusLabels[meeting.status]}
                      </StatusBadge>
                      <Link
                        className="text-sm font-semibold text-brand hover:underline"
                        href={`${organizationRoot}/committees/${meeting.committee_id}/meetings/${meeting.id}`}
                      >
                        Åbn møde
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState compact title="Der er ingen kommende møder." />
            )}
          </PageSection>

          <PageSection
            description="Senest opdaterede referater på tværs af organisationens udvalg."
            title="Seneste referater"
          >
            {overview.recentMinutes.length > 0 ? (
              <div className="divide-y divide-line border-y border-line">
                {overview.recentMinutes.map((minutes) => (
                  <article
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                    key={minutes.id}
                  >
                    <div className="min-w-0">
                      <Link
                        className="font-semibold hover:text-brand hover:underline"
                        href={`${organizationRoot}/committees/${minutes.committeeId}/meetings/${minutes.meetingId}`}
                      >
                        {minutes.meetingTitle}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatDateTime(minutes.meetingStartsAt)} ·{" "}
                        {minutes.committeeName}
                      </p>
                    </div>
                    <StatusBadge tone={minutesStatusTones[minutes.status]}>
                      {meetingMinutesStatusLabels[minutes.status]}
                    </StatusBadge>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState compact title="Der er ingen nyere referater." />
            )}
          </PageSection>
        </div>

        <PageSection
          description="Opfølgning, beslutningsbehov og overførte punkter fra de udvalg, du har adgang til."
          eyebrow="På tværs af organisationen"
          title="Punkter der kræver handling"
        >
          {overview.actionItems.length > 0 ? (
            <div className="divide-y divide-line border-y border-line">
              {overview.actionItems.map((item) => {
                const committeeRoot = `${organizationRoot}/committees/${item.committeeId}`;
                return (
                  <article
                    className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    key={`${item.kind}-${item.id}`}
                  >
                    <div className="min-w-0">
                      <Link
                        className="font-semibold hover:text-brand hover:underline"
                        href={`${committeeRoot}/agenda-items/${item.agendaItemId}`}
                      >
                        <AgendaItemDocumentTitle
                          title={item.title}
                          type={item.itemType}
                        />
                      </Link>
                      <p className="mt-1 text-xs text-muted">
                        {item.committeeName} ·{" "}
                        <Link
                          className="hover:text-brand hover:underline"
                          href={`${committeeRoot}/meetings/${item.meetingId}`}
                        >
                          {item.meetingTitle}
                        </Link>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        tone={item.kind === "transfer" ? "info" : "warning"}
                      >
                        {getActionLabel(item)}
                      </StatusBadge>
                      <span className="text-xs text-muted">
                        {getActionStatus(item)}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Der er ingen punkter, der kræver handling." />
          )}
        </PageSection>
      </div>
    </div>
  );
}
