import Link from "next/link";

import { AgendaItemDocumentTitle } from "@/components/agenda-items/agenda-item-document-title";
import { CommitteeDashboardPriority } from "@/components/dashboard/committee-dashboard-priority";
import { TrashActionButton } from "@/components/trash/trash-action-button";
import {
  ActionMenu,
  EmptyState,
  PageHeader,
  PageSection,
  StatusBadge,
  buttonClassName,
  type StatusTone,
} from "@/components/ui";
import {
  agendaItemMinutesStatusLabels,
  committeeRoleLabels,
  formatDateTime,
  meetingMinutesStatusLabels,
  transferredAgendaItemStatusLabels,
} from "@/lib/localization";
import { isOrganizationAdmin } from "@/lib/permissions";
import { getMeetingCapabilities } from "@/lib/meeting-capabilities";
import { resolveCommitteeDashboardAudience } from "@/lib/dashboard-prioritization";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { CommitteeService } from "@/services/committee-service";
import type {
  CommitteeOverviewActionItem,
  CommitteeOverviewTransfer,
} from "@/types/domain";

const minutesStatusTones = {
  draft: "neutral",
  ready_for_approval: "warning",
  approved: "success",
} as const satisfies Record<string, StatusTone>;

const transferStatusTones = {
  pending: "warning",
  scheduled: "info",
  dismissed: "neutral",
} as const satisfies Record<string, StatusTone>;

function ActionItemsList({
  items,
  root,
  emptyText,
}: {
  items: CommitteeOverviewActionItem[];
  root: string;
  emptyText: string;
}) {
  if (items.length === 0) {
    return <EmptyState compact title={emptyText} />;
  }

  return (
    <div className="divide-y divide-line border-y border-line">
      {items.slice(0, 5).map((item) => (
        <article className="py-3" key={item.id}>
          <Link
            className="font-semibold text-ink hover:text-brand hover:underline"
            href={`${root}/agenda-items/${item.agendaItemId}`}
          >
            <AgendaItemDocumentTitle title={item.title} type={item.itemType} />
          </Link>
          <p className="mt-1 text-xs text-muted">
            {agendaItemMinutesStatusLabels[item.status]} · {item.meetingTitle}
          </p>
        </article>
      ))}
    </div>
  );
}

function TransfersList({
  items,
  root,
}: {
  items: CommitteeOverviewTransfer[];
  root: string;
}) {
  if (items.length === 0) {
    return <EmptyState compact title="Der er ingen overførte punkter." />;
  }

  return (
    <div className="divide-y divide-line border-y border-line">
      {items.slice(0, 5).map((item) => (
        <article className="py-3" key={item.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              className="font-semibold text-ink hover:text-brand hover:underline"
              href={`${root}/agenda-items/${item.agendaItemId}`}
            >
              <AgendaItemDocumentTitle
                title={item.title}
                type={item.itemType}
              />
            </Link>
            <StatusBadge tone={transferStatusTones[item.status]}>
              {transferredAgendaItemStatusLabels[item.status]}
            </StatusBadge>
          </div>
          <p className="mt-1 text-xs text-muted">
            Overført fra{" "}
            <Link
              className="font-medium text-brand hover:underline"
              href={`${root}/meetings/${item.meetingId}`}
            >
              {item.meetingTitle}
            </Link>
          </p>
        </article>
      ))}
    </div>
  );
}

export default async function CommitteeDashboardPage({
  params,
}: {
  params: Promise<{ organizationId: string; committeeId: string }>;
}) {
  const { organizationId, committeeId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db).requireCommitteeMember(
    organizationId,
    committeeId,
    user.id,
  );
  const overview = await new CommitteeService(db).getOverview(
    organizationId,
    committeeId,
  );
  const now = Date.now();
  const upcomingMeetings = overview.meetings
    .filter(
      (meeting) =>
        meeting.status !== "cancelled" &&
        new Date(meeting.starts_at).getTime() >= now,
    )
    .sort(
      (left, right) =>
        new Date(left.starts_at).getTime() -
        new Date(right.starts_at).getTime(),
    );
  const nextMeeting = upcomingMeetings[0] ?? null;
  const otherUpcomingMeetings = upcomingMeetings.slice(1, 6);
  const capabilities = getMeetingCapabilities(
    context.organizationMembership.role,
    context.membership?.role ?? null,
  );
  const canEditCommittee = isOrganizationAdmin(
    context.organizationMembership.role,
  );
  const dashboardAudience = resolveCommitteeDashboardAudience(
    context.organizationMembership.role,
    context.membership?.role ?? null,
    capabilities,
  );
  const root = `/organizations/${organizationId}/committees/${committeeId}`;

  return (
    <div className="section-stack">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {capabilities.createAgendaItem ? (
              <Link
                className={buttonClassName()}
                href={`${root}/agenda-items/new`}
              >
                Nyt dagsordenspunkt
              </Link>
            ) : null}
            {canEditCommittee ? (
              <ActionMenu>
                <Link
                  className="block px-3 py-2 text-sm font-semibold text-ink transition hover:bg-background"
                  href={`${root}/edit`}
                >
                  Rediger udvalg
                </Link>
                <TrashActionButton
                  confirmMessage="Er du sikker på, at du vil flytte dette til papirkurven? Elementet kan gendannes i 30 dage."
                  endpoint={`/api/committees/${committeeId}?organizationId=${organizationId}`}
                  label="Flyt udvalg til papirkurv"
                  pendingLabel="Flytter..."
                  redirectTo={`/organizations/${organizationId}`}
                />
              </ActionMenu>
            ) : null}
          </div>
        }
        description="Se møder, dagsordenspunkter, referater og opfølgning for udvalget."
        eyebrow="Udvalg"
        title={context.committee.name}
      />

      <CommitteeDashboardPriority
        capabilities={capabilities}
        committeeRole={context.membership?.role ?? null}
        nextMeeting={nextMeeting}
        organizationId={organizationId}
        organizationRole={context.organizationMembership.role}
        overview={overview}
        root={root}
      />

      <div className="grid divide-y divide-line border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-1 py-4 sm:px-5">
          <p className="metadata">Kommende møder</p>
          <p className="mt-1 text-2xl font-semibold">
            {upcomingMeetings.length}
          </p>
        </div>
        {dashboardAudience === "viewer" ? (
          <>
            <div className="px-1 py-4 sm:px-5">
              <p className="metadata">Godkendte referater</p>
              <p className="mt-1 text-2xl font-semibold">
                {
                  overview.recentMinutes.filter(
                    (minutes) => minutes.status === "approved",
                  ).length
                }
              </p>
            </div>
            <div className="px-1 py-4 sm:px-5">
              <p className="metadata">Læserolle</p>
              <p className="mt-1 text-sm font-semibold">
                Ingen skrivehandlinger
              </p>
            </div>
          </>
        ) : dashboardAudience === "member" ? (
          <>
            <div className="px-1 py-4 sm:px-5">
              <p className="metadata">Mine åbne opgaver</p>
              <p className="mt-1 text-2xl font-semibold">
                {overview.myOpenTasks.length}
              </p>
            </div>
            <div className="px-1 py-4 sm:px-5">
              <p className="metadata">Aktive beslutninger</p>
              <p className="mt-1 text-2xl font-semibold">
                {overview.activeDecisions.length}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="px-1 py-4 sm:px-5">
              <p className="metadata">Punkter der kræver handling</p>
              <p className="mt-1 text-2xl font-semibold">
                {overview.openFollowUps.length +
                  overview.decisionsRequired.length +
                  overview.transfers.length}
              </p>
            </div>
            <div className="px-1 py-4 sm:px-5">
              <p className="metadata">Medlemmer</p>
              <p className="mt-1 text-2xl font-semibold">
                {overview.members.length}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <PageSection
          description="De næste planlagte møder efter det førstkommende."
          title="Kommende møder"
        >
          {otherUpcomingMeetings.length > 0 ? (
            <div className="divide-y divide-line border-y border-line">
              {otherUpcomingMeetings.map((meeting) => (
                <article
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  key={meeting.id}
                >
                  <div>
                    <h3 className="font-semibold">{meeting.title}</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDateTime(meeting.starts_at)} ·{" "}
                      {meeting.agenda_item_occurrences.length}{" "}
                      {meeting.agenda_item_occurrences.length === 1
                        ? "punkt"
                        : "punkter"}
                    </p>
                  </div>
                  <Link
                    className="text-sm font-semibold text-brand hover:underline"
                    href={`${root}/meetings/${meeting.id}`}
                  >
                    Åbn møde
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              title={
                nextMeeting
                  ? "Der er ingen yderligere kommende møder."
                  : "Der er ingen kommende møder."
              }
            />
          )}
        </PageSection>

        <PageSection
          description="Senest opdaterede referater, som du har adgang til."
          title="Seneste referater"
        >
          {overview.recentMinutes.length > 0 ? (
            <div className="divide-y divide-line border-y border-line">
              {overview.recentMinutes.map((minutes) => (
                <article
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  key={minutes.id}
                >
                  <div>
                    <Link
                      className="font-semibold hover:text-brand hover:underline"
                      href={`${root}/meetings/${minutes.meetingId}`}
                    >
                      {minutes.meetingTitle}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDateTime(minutes.meetingStartsAt)}
                    </p>
                  </div>
                  <StatusBadge tone={minutesStatusTones[minutes.status]}>
                    {meetingMinutesStatusLabels[minutes.status]}
                  </StatusBadge>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState compact title="Der er ingen seneste referater." />
          )}
        </PageSection>
      </div>

      {dashboardAudience !== "viewer" ? (
        <PageSection
          description="Aktuelle punkter fra referater og videreførelse."
          eyebrow="Aktuelt i udvalget"
          title="Punkter der kræver handling"
        >
          <div className="grid gap-7 lg:grid-cols-3">
            <section>
              <h3 className="mb-3 font-semibold">Åbne opfølgningspunkter</h3>
              <ActionItemsList
                emptyText="Der er ingen åbne opfølgningspunkter."
                items={overview.openFollowUps}
                root={root}
              />
            </section>
            <section>
              <h3 className="mb-3 font-semibold">Kræver beslutning</h3>
              <ActionItemsList
                emptyText="Der er ingen punkter, der kræver beslutning."
                items={overview.decisionsRequired}
                root={root}
              />
            </section>
            <section>
              <h3 className="mb-3 font-semibold">Overførte punkter</h3>
              <TransfersList items={overview.transfers} root={root} />
            </section>
          </div>
        </PageSection>
      ) : null}

      <PageSection
        description="Aktive medlemmer og deres roller i udvalget."
        title="Medlemmer"
      >
        {overview.members.length > 0 ? (
          <div className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {overview.members.map((member) => (
              <article className="min-w-0 bg-surface p-4" key={member.userId}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{member.name}</h3>
                    <p className="mt-1 truncate text-xs text-muted">
                      {member.email}
                    </p>
                  </div>
                  <StatusBadge>{committeeRoleLabels[member.role]}</StatusBadge>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Der er endnu ikke registreret medlemmer i udvalget." />
        )}
      </PageSection>
    </div>
  );
}
