import { notFound } from "next/navigation";

import { SendMeetingAgendaEmailModal } from "@/components/email/send-meeting-agenda-email-modal";
import { AddAgendaItemModal } from "@/components/meetings/add-agenda-item-modal";
import { EditMeetingModal } from "@/components/meetings/edit-meeting-modal";
import { MeetingAiOverview } from "@/components/meetings/meeting-ai-overview";
import { MeetingDocumentHeader } from "@/components/meetings/meeting-document-header";
import { MeetingMinutesSection } from "@/components/meetings/meeting-minutes-section";
import { MeetingParticipantsPanel } from "@/components/meetings/meeting-participants-panel";
import { TransferredAgendaItemsSection } from "@/components/meetings/transferred-agenda-items-section";
import { TrashActionButton } from "@/components/trash/trash-action-button";
import { PageSection, StatusBadge, buttonClassName } from "@/components/ui";
import {
  agendaItemMinutesStatusLabels,
  agendaItemTransferReasonLabels,
  agendaItemTypeLabels,
  formatDate,
  formatDateTime,
} from "@/lib/localization";
import { agendaItemMinutesNeedsAction } from "@/lib/agenda-item-minutes";
import { getMeetingCapabilities } from "@/lib/permissions";
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

function hasAgendaMinutesText(
  minutes: {
    notes?: string | null;
    decision?: string | null;
    follow_up?: string | null;
  } | null,
) {
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
    {
      label: "Mangler referat",
      value: missingMinutesCount,
      attention: missingMinutesCount > 0,
    },
    {
      label: "Beslutning/opfølgning",
      value: actionPointCount,
      attention: actionPointCount > 0,
    },
    { label: "Aktive beslutninger", value: openDecisionCount },
    {
      label: "Åbne opgaver",
      value: openTaskCount,
      attention: openTaskCount > 0,
    },
  ];

  return (
    <section
      className="mt-5 border-y border-line py-3"
      aria-label="Mødeoverblik"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="page-eyebrow">Mødeoverblik</p>
          <p className="mt-1 text-sm text-muted">
            De vigtigste arbejdspunkter for mødet samlet ét sted.
          </p>
        </div>
      </div>
      <dl className="metric-strip">
        {items.map((item) => (
          <div className="metric-item" key={item.label}>
            <dt className="metric-label">{item.label}</dt>
            <dd className="mt-1 flex items-baseline gap-2">
              <span className="metric-value">{item.value}</span>
              {item.attention ? (
                <span className="text-xs font-semibold text-warning">
                  Kræver blik
                </span>
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
      transfer.targetAgendaItemId
        ? [[transfer.targetAgendaItemId, transfer] as const]
        : [],
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
    participants,
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
    meetingService.getParticipants(organizationId, committeeId, meetingId),
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
  const meetingCapabilities = getMeetingCapabilities(
    organizationRole,
    committeeRole,
  );
  const canEditDecisions =
    meetingCapabilities.editDecisions && decisionContext.canEdit;
  const canEditTasks = meetingCapabilities.editTasks && taskContext.canEdit;
  const registeredInternalParticipantCount =
    participants.internalParticipants.filter((attendee) =>
      ["accepted", "attended", "absent", "excused"].includes(
        attendee.attendance_status,
      ),
    ).length;
  const presentInternalParticipantCount =
    participants.internalParticipants.filter(
      (attendee) =>
        attendee.attendance_status === "accepted" ||
        attendee.attendance_status === "attended",
    ).length;
  const registeredParticipantCount =
    registeredInternalParticipantCount + participants.externalAttendees.length;
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
  const approvalRecipientInfo = {
    mode:
      registeredInternalParticipantCount > 0
        ? ("participants" as const)
        : ("fallback" as const),
    eligibleCount:
      registeredInternalParticipantCount > 0
        ? presentInternalParticipantCount
        : emailRecipients.length,
    fallbackMemberCount: emailRecipients.length,
    registeredInternalCount: registeredInternalParticipantCount,
    externalCount: participants.externalAttendees.length,
  };
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
        (transfer) => transfer.targetAgendaItemId === occurrence.agenda_item_id,
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
  const openDecisionCount =
    decisionContext.decisions.filter(isActiveDecision).length;
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
            <a
              className={buttonClassName({ variant: "secondary" })}
              href={`/api/meetings/${meetingId}/agenda/pdf?organizationId=${organizationId}&committeeId=${committeeId}`}
            >
              Download dagsorden
            </a>
            <a
              className={buttonClassName({ variant: "secondary" })}
              href={`/api/meetings/${meetingId}/tasks/pdf?organizationId=${organizationId}&committeeId=${committeeId}`}
            >
              Download opgaveliste PDF
            </a>
            {meetingCapabilities.updateMeeting ||
            meetingCapabilities.sendAgendaEmail ||
            meetingCapabilities.deleteMeeting ? (
              <>
                {meetingCapabilities.updateMeeting ? (
                  <EditMeetingModal
                    committeeId={committeeId}
                    meeting={meeting}
                    organizationId={organizationId}
                  />
                ) : null}
                {meetingCapabilities.sendAgendaEmail ? (
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
                ) : null}
                {meetingCapabilities.deleteMeeting ? (
                  <TrashActionButton
                    confirmMessage="Er du sikker på, at du vil flytte dette til papirkurven? Elementet kan gendannes i 30 dage."
                    endpoint={`/api/meetings/${meetingId}?organizationId=${organizationId}&committeeId=${committeeId}`}
                    label="Flyt møde til papirkurv"
                    pendingLabel="Flytter..."
                    redirectTo={root}
                    variant="secondary"
                  />
                ) : null}
              </>
            ) : null}
          </>
        }
        agendaItemCount={meeting.agenda_item_occurrences.length}
        committeeName={context.committee.name}
        meeting={meeting}
        minutesStatus={minutes.meetingMinutes?.status ?? null}
        participantSummary={{
          action: (
            <MeetingParticipantsPanel
              canEdit={meetingCapabilities.manageParticipants}
              committeeId={committeeId}
              externalAttendees={participants.externalAttendees}
              internalParticipants={participants.internalParticipants}
              meetingId={meetingId}
              members={memberDirectory}
              organizationId={organizationId}
            />
          ),
          externalCount: participants.externalAttendees.length,
          presentInternalCount: presentInternalParticipantCount,
          registeredCount: registeredParticipantCount,
        }}
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
          meetingCapabilities.scheduleAgendaItem ? (
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
          ) : null
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
        <MeetingMinutesSection
          agendaItemAttachments={minutes.agendaItemAttachments}
          approvals={minutes.approvals}
          approvalRecipientInfo={approvalRecipientInfo}
          canApprove={minutes.canApprove}
          canEdit={meetingCapabilities.editOfficialMinutes}
          canEditDecisions={canEditDecisions}
          canEditTasks={canEditTasks}
          committeeId={committeeId}
          decisionCategorySource={decisionContext.categorySource}
          decisionHistoryByAgendaItem={decisionContext.historyByAgendaItem}
          initialAgendaItemMinutes={minutes.agendaItemMinutes}
          initialMeetingMinutes={minutes.meetingMinutes}
          meetingAttachments={minutes.meetingAttachments}
          privateAgendaItemNotes={minutes.privateAgendaItemNotes}
          referentLock={minutes.referentLock}
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
          canEdit={meetingCapabilities.manageTransferredAgendaItems}
          futureMeetings={transferredAgendaItems.futureMeetings}
          items={transferredAgendaItems.items}
          root={root}
        />
      </PageSection>
    </div>
  );
}
