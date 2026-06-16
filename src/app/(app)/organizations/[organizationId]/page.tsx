import Link from "next/link";
import { notFound } from "next/navigation";

import { AgendaItemDocumentTitle } from "@/components/agenda-items/agenda-item-document-title";
import { RelatedDecisions } from "@/components/decisions/related-decisions";
import { RelatedTasks } from "@/components/tasks/related-tasks";
import { TrashActionButton } from "@/components/trash/trash-action-button";
import {
  ContentPanel,
  EmptyState,
  ActionMenu,
  PageHeader,
  PageSection,
  StatusBadge,
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
import type { OrganizationOverviewActionItem, TaskView } from "@/types/domain";

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

function getDeadlineBuckets(tasks: TaskView[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 7);

  return {
    overdue: tasks.filter((task) => {
      if (!task.deadline) return false;
      return new Date(`${task.deadline}T00:00:00`) < today;
    }),
    dueSoon: tasks.filter((task) => {
      if (!task.deadline) return false;
      const deadline = new Date(`${task.deadline}T00:00:00`);
      return deadline >= today && deadline <= soon;
    }),
  };
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
  const nextMeeting = overview.upcomingMeetings[0] ?? null;
  const deadlineBuckets = getDeadlineBuckets(overview.openTasks);
  const attentionTasks = overview.myOpenTasks.length
    ? overview.myOpenTasks
    : overview.openTasks;
  const attentionCount =
    overview.metrics.myOpenTaskCount +
    overview.metrics.decisionsRequiredCount +
    deadlineBuckets.overdue.length;

  return (
    <div className="space-y-7">
      <PageHeader
          actions={
            canManage ? (
              <ActionMenu>
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
            ) : null
          }
          description="Få hurtigt overblik over egne opgaver, kommende møder, beslutninger og punkter, der kræver opmærksomhed."
          eyebrow={
            <Link className="text-muted transition hover:text-brand" href="/organizations">
              ← Organisationer
            </Link>
          }
          title={context.organization.name}
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
          <ContentPanel className="border-x-0 bg-transparent p-0 shadow-none">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Først
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  Kræver opmærksomhed
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {attentionCount
                    ? `${attentionCount} ting bør ses først.`
                    : "Der er ikke noget kritisk lige nu."}
                </p>
              </div>
              <Link
                className="text-sm font-semibold text-brand hover:underline"
                href={`${organizationRoot}/tasks/my`}
              >
                Mine opgaver
              </Link>
            </div>

            {deadlineBuckets.overdue.length ||
            deadlineBuckets.dueSoon.length ? (
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[var(--radius-control)] border border-danger/20 bg-danger/5 p-3">
                  <p className="text-xs font-semibold text-danger">
                    Overskredne deadlines
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {deadlineBuckets.overdue.length}
                  </p>
                </div>
                <div className="rounded-[var(--radius-control)] border border-warning/20 bg-warning/5 p-3">
                  <p className="text-xs font-semibold text-warning">
                    Deadline inden 7 dage
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {deadlineBuckets.dueSoon.length}
                  </p>
                </div>
              </div>
            ) : null}

            {attentionTasks.length ? (
              <RelatedTasks
                compact
                organizationId={organizationId}
                tasks={attentionTasks}
              />
            ) : (
              <EmptyState
                compact
                description="Når du eller organisationen får åbne opgaver, vises de her."
                title="Der er ingen åbne opgaver lige nu."
              />
            )}
          </ContentPanel>

          <ContentPanel className="border-x-0 bg-transparent p-0 shadow-none">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Næste
                </p>
                <h2 className="mt-1 text-xl font-semibold">Mødeforberedelse</h2>
              </div>
              <Link
                className="text-sm font-semibold text-brand hover:underline"
                href={`${organizationRoot}/meetings`}
              >
                Se møder
              </Link>
            </div>
            {nextMeeting ? (
              <div>
                <Link
                  className="text-lg font-semibold hover:text-brand hover:underline"
                  href={`${organizationRoot}/committees/${nextMeeting.committee_id}/meetings/${nextMeeting.id}`}
                >
                  {nextMeeting.title}
                </Link>
                <p className="mt-1 text-sm text-muted">
                  {formatDateTime(nextMeeting.starts_at)} ·{" "}
                  {nextMeeting.committeeName}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge tone={meetingStatusTones[nextMeeting.status]}>
                    {meetingStatusLabels[nextMeeting.status]}
                  </StatusBadge>
                  <StatusBadge>
                    {nextMeeting.agenda_item_occurrences.length}{" "}
                    {nextMeeting.agenda_item_occurrences.length === 1
                      ? "punkt"
                      : "punkter"}
                  </StatusBadge>
                </div>
                <p className="mt-4 text-xs leading-5 text-muted">
                  Her er det naturlige sted til en fremtidig “Hurtigt møde”-
                  handling, uden at den implementeres i denne fase.
                </p>
              </div>
            ) : (
              <EmptyState
                compact
                description="Opret et møde, når organisationen er klar til næste dagsorden."
                title="Der er ingen kommende møder."
              />
            )}
          </ContentPanel>
        </div>

        <details className="group border-y border-line bg-transparent">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span>Mere overblik</span>
            <span className="text-xs font-semibold text-brand">
              <span className="group-open:hidden">
                Vis beslutninger, møder og udvalg
              </span>
              <span className="hidden group-open:inline">Skjul</span>
            </span>
          </summary>
          <div className="space-y-3 border-t border-line p-3 sm:p-4">
            <details className="group border-b border-line pb-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>Beslutninger og punkter</span>
                <span className="text-xs text-brand">
                  <span className="group-open:hidden">Åbn</span>
                  <span className="hidden group-open:inline">Skjul</span>
                </span>
              </summary>
        <div className="grid gap-6 pt-3 xl:grid-cols-2">
          <PageSection
            description="De vigtigste beslutninger, som stadig er aktive."
            title="Aktive beslutninger"
          >
            {overview.activeDecisions.length ? (
              <RelatedDecisions
                compact
                decisions={overview.activeDecisions}
                organizationId={organizationId}
              />
            ) : (
              <EmptyState
                compact
                description="Når beslutninger oprettes fra møder eller registeret, vises aktive beslutninger her."
                title="Der er ingen aktive beslutninger."
              />
            )}
          </PageSection>

          <PageSection
            description="Opfølgning, beslutningsbehov og overførte punkter."
            title="Punkter der kræver handling"
          >
            {overview.actionItems.length > 0 ? (
              <div className="divide-y divide-line border-y border-line">
                {overview.actionItems.slice(0, 6).map((item) => {
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
              <EmptyState
                compact
                description="Når opfølgninger eller beslutningspunkter opstår i referater, samles de her."
                title="Der er ingen punkter, der kræver handling."
              />
            )}
          </PageSection>
        </div>
            </details>

            <details className="group border-b border-line pb-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>Møder og referater</span>
                <span className="text-xs text-brand">
                  <span className="group-open:hidden">Åbn</span>
                  <span className="hidden group-open:inline">Skjul</span>
                </span>
              </summary>
        <div className="grid gap-6 pt-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
          <PageSection
            description="Næste møder på tværs af de udvalg, du har adgang til."
            title="Kommende møder"
          >
            {overview.upcomingMeetings.length > 0 ? (
              <div className="divide-y divide-line border-y border-line">
                {overview.upcomingMeetings.slice(0, 5).map((meeting) => (
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
                    <StatusBadge tone={meetingStatusTones[meeting.status]}>
                      {meetingStatusLabels[meeting.status]}
                    </StatusBadge>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                description="Når der oprettes møder i udvalg, får du et samlet overblik her."
                title="Der er ingen kommende møder."
              />
            )}
          </PageSection>

          <PageSection
            description="Senest opdaterede referater."
            title="Seneste referater"
          >
            {overview.recentMinutes.length > 0 ? (
              <div className="divide-y divide-line border-y border-line">
                {overview.recentMinutes.slice(0, 4).map((minutes) => (
                  <article className="py-3" key={minutes.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
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
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                description="Når møder får referater, vises de seneste her."
                title="Der er ingen nyere referater."
              />
            )}
          </PageSection>
        </div>
            </details>

            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>Udvalg</span>
                <span className="text-xs text-brand">
                  <span className="group-open:hidden">Åbn</span>
                  <span className="hidden group-open:inline">Skjul</span>
                </span>
              </summary>
              <div className="pt-3">
        <PageSection
          description="Organisationens udvalg og deres nærmeste planlagte arbejde."
          title="Udvalg"
        >
          <div>
            {overview.committees.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {overview.committees.map(
                  ({
                    committee,
                    nextMeeting: committeeNextMeeting,
                    upcomingMeetingCount,
                    openFollowUpCount,
                  }) => {
                    const committeeRoot = `${organizationRoot}/committees/${committee.id}`;
                    return (
                      <article
                        className="rounded-[var(--radius-panel)] border border-line bg-surface/80 p-4"
                        key={committee.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-semibold">{committee.name}</h3>
                            <p className="mt-1 text-sm text-muted">
                              {committee.description ||
                                "Der er endnu ingen beskrivelse."}
                            </p>
                          </div>
                          <Link
                            className="text-sm font-semibold text-brand hover:underline"
                            href={committeeRoot}
                          >
                            Åbn
                          </Link>
                        </div>
                        <div className="mt-3 grid gap-1 text-xs text-muted">
                          <span>
                            Næste møde:{" "}
                            {committeeNextMeeting
                              ? formatDateTime(committeeNextMeeting.starts_at)
                              : "Ikke planlagt"}
                          </span>
                          <span>
                            {upcomingMeetingCount} kommende ·{" "}
                            {openFollowUpCount} åbne opfølgninger
                          </span>
                        </div>
                      </article>
                    );
                  },
                )}
              </div>
            ) : (
              <EmptyState
                description="Start med at oprette et udvalg, så møder, dagsordenspunkter og opgaver får et naturligt hjem."
                title="Der er endnu ikke oprettet udvalg i organisationen."
              />
            )}

          </div>
        </PageSection>
              </div>
            </details>
          </div>
        </details>
    </div>
  );
}
