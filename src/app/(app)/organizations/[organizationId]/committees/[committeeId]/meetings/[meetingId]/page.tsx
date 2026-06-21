import { notFound } from "next/navigation";

import { DecisionCreateModal } from "@/components/decisions/decision-create-modal";
import { RelatedDecisions } from "@/components/decisions/related-decisions";
import { SendMeetingAgendaEmailModal } from "@/components/email/send-meeting-agenda-email-modal";
import { AddAgendaItemModal } from "@/components/meetings/add-agenda-item-modal";
import { EditMeetingModal } from "@/components/meetings/edit-meeting-modal";
import { MeetingAiOverview } from "@/components/meetings/meeting-ai-overview";
import { MeetingDocumentHeader } from "@/components/meetings/meeting-document-header";
import { MeetingMinutesSection } from "@/components/meetings/meeting-minutes-section";
import { TransferredAgendaItemsSection } from "@/components/meetings/transferred-agenda-items-section";
import { RelatedTasks } from "@/components/tasks/related-tasks";
import { TaskCreateModal } from "@/components/tasks/task-create-modal";
import { TrashActionButton } from "@/components/trash/trash-action-button";
import { ActionMenu, PageSection, StatusBadge } from "@/components/ui";
import {
  agendaItemMinutesStatusLabels,
  agendaItemTransferReasonLabels,
  agendaItemTypeLabels,
  formatDate,
  formatDateTime,
} from "@/lib/localization";
import { agendaItemMinutesNeedsAction } from "@/lib/agenda-item-minutes";
import { canManageCommittee } from "@/lib/permissions";
import { firstRichTextToPlainText } from "@/lib/rich-text";
import { createClient } from "@/lib/supabase/server";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { DecisionService } from "@/services/decision-service";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";
import { MeetingService } from "@/services/meeting-service";
import { TaskService } from "@/services/task-service";
import { TransferredAgendaItemService } from "@/services/transferred-agenda-item-service";
import { AgendaItemDocumentTitle } from "@/components/agenda-items/agenda-item-document-title";
import type { MeetingWithAgenda } from "@/types/domain";

type AgendaOccurrence = MeetingWithAgenda["agenda_item_occurrences"][number];

function isOpenTask(status: string, archivedAt?: string | null) {
  return !archivedAt && !["completed", "cancelled"].includes(status);
}

function isActiveDecision(decision: {
  status: string;
  archived_at?: string | null;
  cancelled_at?: string | null;
}) {
  return (
    !decision.archived_at &&
    !decision.cancelled_at &&
    !["completed", "cancelled"].includes(decision.status)
  );
}

function hasAgendaMinutesText(minutes: {
  notes?: string | null;
  decision?: string | null;
  follow_up?: string | null;
} | null) {
  if (!minutes) return false;
  return Boolean(
    firstRichTextToPlainText(
      minutes.notes ?? "",
      minutes.decision ?? "",
      minutes.follow_up ?? "",
    ).trim(),
  );
}

function MeetingWorkOverview({
  agendaItemCount,
  incomingTransferCount,
  missingMinutesCount,
  actionPointCount,
  openDecisionCount,
  openTaskCount,
}: {
  agendaItemCount: number;
  incomingTransferCount: number;
  missingMinutesCount: number;
  actionPointCount: number;
  openDecisionCount: number;
  openTaskCount: number;
}) {
  const items = [
    { label: "Dagsordenspunkter", value: agendaItemCount },
    { label: "Overført hertil", value: incomingTransferCount },
    { label: "Mangler referat", value: missingMinutesCount, attention: missingMinutesCount > 0 },
    { label: "Beslutning/opfølgning", value: actionPointCount, attention: actionPointCount > 0 },
    { label: "Aktive beslutninger", value: openDecisionCount },
    { label: "Åbne opgaver", value: openTaskCount, attention: openTaskCount > 0 },
  ];

  return (
    <section className="mt-5 border-y border-line py-3" aria-label="Mødeoverblik">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="page-eyebrow">Mødeoverblik</p>
          <p className="mt-1 text-sm text-muted">
            De vigtigste arbejdspunkter for mødet samlet ét sted.
          </p>
        </div>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {items.map((item) => (
          <div
            className="border-l-2 border-line bg-subtle/25 px-3 py-2"
            key={item.label}
          >
            <dt className="text-xs font-medium text-muted">{item.label}</dt>
            <dd className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-semibold text-ink">{item.value}</span>
              {item.attention ? (
                <span className="text-xs font-semibold text-warning">Kræver blik</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function IncomingTransferredItems({
  occurrences,
  incomingTransfers,
  root,
}: {
  occurrences: AgendaOccurrence[];
  incomingTransfers: Awaited<
    ReturnType<TransferredAgendaItemService["listForMeeting"]>
  >["incomingItems"];
  root: string;
}) {
  const transfersByTargetAgendaItem = new Map(
    incomingTransfers.flatMap((transfer) =>
      transfer.targetAgendaItemId ? [[transfer.targetAgendaItemId, transfer] as const] : [],
    ),
  );
  const transferredOccurrences = occurrences.filter((occurrence) => {
    const item = occurrence.agenda_items;
    return item && (item.parent_id || transfersByTargetAgendaItem.has(item.id));
  });

  if (transferredOccurrences.length === 0) return null;

  return (
    <section className="mb-4 border-y border-progress/25 bg-progress-soft/35 px-3 py-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="page-eyebrow text-progress">Overført til dette møde</p>
          <h3 className="mt-1 text-base font-semibold text-ink">
            Punkter der fortsætter fra tidligere møder
          </h3>
        </div>
        <span className="text-sm font-medium text-muted">
          {transferredOccurrences.length}{" "}
          {transferredOccurrences.length === 1 ? "punkt" : "punkter"}
        </span>
      </div>
      <div className="mt-3 divide-y divide-line border-y border-line bg-surface/75">
        {transferredOccurrences.map((occurrence) => {
          const item = occurrence.agenda_items!;
          const transfer = transfersByTargetAgendaItem.get(item.id);
          return (
            <article
              className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto]"
              key={occurrence.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="progress">Overført punkt</StatusBadge>
                  <StatusBadge>
                    {agendaItemTypeLabels[item.item_type].short}
                  </StatusBadge>
                  {transfer ? (
                    <StatusBadge tone="warning">
                      {agendaItemMinutesStatusLabels[transfer.sourceStatus]}
                    </StatusBadge>
                  ) : null}
                </div>
                <h4 className="mt-1.5 break-words text-sm font-semibold text-ink">
                  <AgendaItemDocumentTitle
                    title={item.title}
                    type={item.item_type}
                  />
                </h4>
                <p className="mt-1 text-xs text-muted">
                  {transfer?.sourceMeeting ? (
                    <>
                      Fra{" "}
                      <a
                        className="font-semibold text-brand hover:underline"
                        href={`${root}/meetings/${transfer.sourceMeeting.id}`}
                      >
                        {transfer.sourceMeeting.title}
                      </a>{" "}
                      den {formatDate(transfer.sourceMeeting.starts_at)}
                    </>
                  ) : (
                    "Kildemøde er ikke angivet i den nuværende overførsel."
                  )}
                  {transfer ? (
                    <>
                      {" · "}
                      {agendaItemTransferReasonLabels[transfer.transferReason]}
                    </>
                  ) : null}
                </p>
              </div>
              <a
                className="self-center text-sm font-semibold text-brand hover:underline"
                href={`#agenda-point-${occurrence.id}`}
              >
                Arbejd med punktet
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default async function MeetingPage({
  params,
}: {
  params: Promise<{
    organizationId: string;
    committeeId: string;
    meetingId: string;
  }>;
}) {
  const { organizationId, committeeId, meetingId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db).requireCommitteeMember(
    organizationId,
    committeeId,
    user.id,
  );
  const meetingService = new MeetingService(db);
  const meeting = await meetingService
    .get(organizationId, committeeId, meetingId)
    .catch(() => null);
  if (!meeting) notFound();

  const minutesService = new MeetingMinutesService(db);
  const [
    minutes,
    previousMeetingMinutes,
    transferredAgendaItems,
    attendees,
    decisionContext,
    taskContext,
    memberDirectory,
  ] = await Promise.all([
      minutesService.get(organizationId, committeeId, meetingId),
      minutesService.getPreviousMeetingReference(
        organizationId,
        committeeId,
        meetingId,
      ),
      new TransferredAgendaItemService(db).listForMeeting(
        organizationId,
        committeeId,
        meetingId,
      ),
      meetingService.listAttendees(organizationId, committeeId, meetingId),
      new DecisionService(db).getMeetingContext(
        organizationId,
        committeeId,
        meetingId,
      ),
      new TaskService(db).getMeetingContext(
        organizationId,
        committeeId,
        meetingId,
      ),
      new OrganizationMemberRepository(db).listMembers(organizationId),
    ]);
  const root = `/organizations/${organizationId}/committees/${committeeId}`;
  const organizationRole = context.organizationMembership.role;
  const committeeRole = context.membership?.role ?? null;
  const canEditMeeting = canManageCommittee(organizationRole, committeeRole);
  const attendeeCount = attendees.filter((attendee) =>
    ["accepted", "attended"].includes(attendee.attendance_status),
  ).length;
  const activeTransfers = transferredAgendaItems.items.filter(
    (item) => item.status !== "dismissed",
  ).length;
  const emailRecipients = memberDirectory
    .filter(
      (member) =>
        member.status === "active" &&
        member.committees.some((committee) => committee.id === committeeId),
    )
    .map((member) => ({
      userId: member.user_id,
      name: member.full_name || member.email,
      email: member.email,
    }));
  const agendaMinutesByItemId = new Map(
    minutes.agendaItemMinutes.map((agendaMinutes) => [
      agendaMinutes.agenda_item_id,
      agendaMinutes,
    ]),
  );
  const incomingTransferCount = meeting.agenda_item_occurrences.filter(
    (occurrence) =>
      occurrence.agenda_items?.parent_id ||
      transferredAgendaItems.incomingItems.some(
        (transfer) =>
          transfer.targetAgendaItemId === occurrence.agenda_item_id,
      ),
  ).length;
  const missingMinutesCount = meeting.agenda_item_occurrences.filter(
    (occurrence) =>
      !hasAgendaMinutesText(
        agendaMinutesByItemId.get(occurrence.agenda_item_id) ?? null,
      ),
  ).length;
  const actionPointCount = meeting.agenda_item_occurrences.filter(
    (occurrence) => {
      const item = occurrence.agenda_items;
      const agendaMinutes = agendaMinutesByItemId.get(
        occurrence.agenda_item_id,
      );
      if (!item || !agendaMinutes) return false;
      const hasDecisionOrFollowUp = Boolean(
        firstRichTextToPlainText(
          agendaMinutes.decision ?? "",
          agendaMinutes.follow_up ?? "",
        ).trim(),
      );
      return (
        hasDecisionOrFollowUp ||
        agendaItemMinutesNeedsAction(
          item.item_type,
          agendaMinutes.status,
          agendaMinutes.follow_up ?? "",
        )
      );
    },
  ).length;
  const openDecisionCount = decisionContext.decisions.filter(isActiveDecision)
    .length;
  const openTaskCount = taskContext.tasks.filter((task) =>
    isOpenTask(task.status, task.archived_at),
  ).length;

  return (
    <div>
      <MeetingDocumentHeader
        actions={
          <>
            <MeetingAiOverview
              committeeId={committeeId}
              meetingId={meetingId}
              organizationId={organizationId}
            />
            {canEditMeeting ? (
              <>
                <EditMeetingModal
                  committeeId={committeeId}
                  meeting={meeting}
                  organizationId={organizationId}
                />
                <SendMeetingAgendaEmailModal
                  agendaItemCount={meeting.agenda_item_occurrences.length}
                  committeeId={committeeId}
                  meetingDateLabel={formatDateTime(meeting.starts_at, "full")}
                  meetingId={meetingId}
                  meetingTitle={meeting.title}
                  organizationId={organizationId}
                  recipients={emailRecipients}
                  triggerStyle="button"
                />
                <TrashActionButton
                  confirmMessage="Er du sikker på, at du vil flytte dette til papirkurven? Elementet kan gendannes i 30 dage."
                  endpoint={`/api/meetings/${meetingId}?organizationId=${organizationId}&committeeId=${committeeId}`}
                  label="Flyt møde til papirkurv"
                  pendingLabel="Flytter..."
                  redirectTo={root}
                  variant="secondary"
                />
              </>
            ) : null}
          </>
        }
        agendaItemCount={meeting.agenda_item_occurrences.length}
        attendeeCount={attendeeCount}
        committeeName={context.committee.name}
        meeting={meeting}
        minutesStatus={minutes.meetingMinutes?.status ?? null}
        transferredItemCount={activeTransfers}
      />

      <MeetingWorkOverview
        actionPointCount={actionPointCount}
        agendaItemCount={meeting.agenda_item_occurrences.length}
        incomingTransferCount={incomingTransferCount}
        missingMinutesCount={missingMinutesCount}
        openDecisionCount={openDecisionCount}
        openTaskCount={openTaskCount}
      />

      <PageSection
        actions={
          <div className="flex flex-wrap gap-2">
            {(decisionContext.canEdit || taskContext.canEdit) ? (
              <ActionMenu className="order-2">
            {decisionContext.canEdit ? (
              <DecisionCreateModal
                agendaItems={meeting.agenda_item_occurrences.flatMap(
                  (occurrence) =>
                    occurrence.agenda_items
                      ? [
                          {
                            id: occurrence.agenda_items.id,
                            title: occurrence.agenda_items.title,
                          },
                        ]
                      : [],
                )}
                categorySource={decisionContext.categorySource}
                committeeId={committeeId}
                meetingDate={meeting.starts_at}
                meetingId={meetingId}
                organizationId={organizationId}
                responsiblePeople={decisionContext.responsiblePeople}
              />
            ) : null}
            {taskContext.canEdit ? (
              <TaskCreateModal
                agendaItems={meeting.agenda_item_occurrences.flatMap(
                  (occurrence) =>
                    occurrence.agenda_items
                      ? [
                          {
                            id: occurrence.agenda_items.id,
                            title: occurrence.agenda_items.title,
                          },
                        ]
                      : [],
                )}
                categorySource={taskContext.categorySource}
                committeeId={committeeId}
                initialMeetingId={meetingId}
                instanceId="meeting-task"
                meetings={[
                  {
                    id: meeting.id,
                    title: meeting.title,
                    starts_at: meeting.starts_at,
                  },
                ]}
                organizationId={organizationId}
                responsiblePeople={taskContext.responsiblePeople}
                triggerLabel="Opret opgave"
              />
            ) : null}
              </ActionMenu>
            ) : null}
            {canEditMeeting ? (
              <AddAgendaItemModal
                committeeId={committeeId}
                meetingId={meeting.id}
                meetings={[
                  {
                    id: meeting.id,
                    title: meeting.title,
                    starts_at: meeting.starts_at,
                  },
                  ...transferredAgendaItems.futureMeetings.map(
                    ({ id, title, starts_at }) => ({
                      id,
                      title,
                      starts_at,
                    }),
                  ),
                ]}
                organizationId={organizationId}
              />
            ) : null}
          </div>
        }
        className="mt-6"
        description="Arbejd gennem dagsordenen punkt for punkt. Noter, beslutninger og opfølgning samles i referatet."
        eyebrow="Mødedokument"
        title="Dagsorden og referat"
      >
        <IncomingTransferredItems
          incomingTransfers={transferredAgendaItems.incomingItems}
          occurrences={meeting.agenda_item_occurrences}
          root={root}
        />
        {decisionContext.decisions.length > 0 || taskContext.tasks.length > 0 ? (
          <details className="group mb-4 rounded-[var(--radius-panel)] border border-line bg-subtle/20">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden sm:px-4">
              <span>
                Relateret arbejde
                <span className="ml-2 font-normal text-muted">
                  {decisionContext.decisions.length} beslutninger ·{" "}
                  {taskContext.tasks.length} opgaver
                </span>
              </span>
              <span className="text-brand">
                <span className="group-open:hidden">Åbn</span>
                <span className="hidden group-open:inline">Skjul</span>
              </span>
            </summary>
            <div className="grid gap-4 border-t border-line p-3 sm:p-4 lg:grid-cols-2">
              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Beslutninger</h3>
                  <a
                    className="text-xs font-semibold text-brand hover:underline"
                    href={`/organizations/${organizationId}/decisions`}
                  >
                    Åbn register
                  </a>
                </div>
                <RelatedDecisions
                  compact
                  decisions={decisionContext.decisions}
                  organizationId={organizationId}
                />
              </section>
              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Opgaver</h3>
                  <a
                    className="text-xs font-semibold text-brand hover:underline"
                    href={`/organizations/${organizationId}/tasks`}
                  >
                    Task Board
                  </a>
                </div>
                <RelatedTasks
                  compact
                  organizationId={organizationId}
                  tasks={taskContext.tasks}
                />
              </section>
            </div>
          </details>
        ) : null}
        <MeetingMinutesSection
          agendaItemAttachments={minutes.agendaItemAttachments}
          approvals={minutes.approvals}
          canApprove={minutes.canApprove}
          canEdit={canEditMeeting}
          canEditDecisions={decisionContext.canEdit}
          canEditTasks={taskContext.canEdit}
          committeeId={committeeId}
          decisionCategorySource={decisionContext.categorySource}
          decisionHistoryByAgendaItem={decisionContext.historyByAgendaItem}
          initialAgendaItemMinutes={minutes.agendaItemMinutes}
          initialMeetingMinutes={minutes.meetingMinutes}
          meetingAttachments={minutes.meetingAttachments}
          meetingId={meetingId}
          meetingDate={meeting.starts_at}
          meetingDecisions={decisionContext.decisions}
          meetingTasks={taskContext.tasks}
          occurrences={meeting.agenda_item_occurrences}
          organizationId={organizationId}
          previousMeetingMinutes={previousMeetingMinutes}
          responsiblePeople={minutes.responsiblePeople}
          taskCategorySource={taskContext.categorySource}
          root={root}
          userId={user.id}
        />
        <TransferredAgendaItemsSection
          canEdit={canEditMeeting}
          futureMeetings={transferredAgendaItems.futureMeetings}
          items={transferredAgendaItems.items}
          root={root}
        />
      </PageSection>
    </div>
  );
}
