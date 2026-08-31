import { notFound } from "next/navigation";
import Link from "next/link";

import { AppIcon } from "@/components/icons/app-icon";
import { SendMeetingMaterialsModal } from "@/components/email/send-meeting-materials-modal";
import { AddAgendaItemModal } from "@/components/meetings/add-agenda-item-modal";
import { EditMeetingModal } from "@/components/meetings/edit-meeting-modal";
import { MeetingAiOverview } from "@/components/meetings/meeting-ai-overview";
import { MeetingDocumentHeader } from "@/components/meetings/meeting-document-header";
import { MeetingMinutesSection } from "@/components/meetings/meeting-minutes-section";
import { MeetingParticipantsPanel } from "@/components/meetings/meeting-participants-panel";
import { TransferredAgendaItemsSection } from "@/components/meetings/transferred-agenda-items-section";
import { TrashActionButton } from "@/components/trash/trash-action-button";
import { Dropdown, StatusBadge } from "@/components/ui";
import {
  agendaItemMinutesStatusLabels,
  agendaItemTransferReasonLabels,
  agendaItemTypeLabels,
  formatDate,
  formatDateTime,
} from "@/lib/localization";
import {
  resolveMeetingParticipantRecipients,
  resolveSelectedMeetingMaterialRecipients,
} from "@/lib/meeting-material-dispatch";
import { getMeetingCapabilities } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { AuthService } from "@/services/auth-service";
import { AgendaItemService } from "@/services/agenda-item-service";
import { AuthorizationService } from "@/services/authorization-service";
import { DecisionService } from "@/services/decision-service";
import { DocumentService } from "@/services/document-service";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";
import { MeetingMaterialDispatchService } from "@/services/meeting-material-dispatch-service";
import { MeetingService } from "@/services/meeting-service";
import { TaskService } from "@/services/task-service";
import { TransferredAgendaItemService } from "@/services/transferred-agenda-item-service";
import { AgendaItemDocumentTitle } from "@/components/agenda-items/agenda-item-document-title";
import type { MeetingWithAgenda } from "@/types/domain";

type AgendaOccurrence = MeetingWithAgenda["agenda_item_occurrences"][number];

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

void MeetingWorkOverview;
void IncomingTransferredItems;

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
    agendaItemHistoryMetadata,
    documentContext,
    dispatchHistory,
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
    new AgendaItemService(db)
      .getAgendaItemHistoryMetadataBatch({
        organizationId,
        committeeId,
        agendaItemIds: meeting.agenda_item_occurrences.map(
          (occurrence) => occurrence.agenda_item_id,
        ),
      })
      .catch(() => []),
    new DocumentService(db).getMeetingDocumentContext({
      organizationId,
      committeeId,
      meetingId,
      agendaItemIds: meeting.agenda_item_occurrences.map(
        (occurrence) => occurrence.agenda_item_id,
      ),
    }),
    new MeetingMaterialDispatchService(db).listHistory(
      organizationId,
      committeeId,
      meetingId,
    ),
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
  const participantRecipientResolution = resolveMeetingParticipantRecipients({
    committeeId,
    members: memberDirectory,
    internalParticipants: participants.internalParticipants,
    externalParticipants: participants.externalAttendees,
  });
  const participantUserIds = new Set(
    participantRecipientResolution.recipients.flatMap((recipient) =>
      recipient.userId ? [recipient.userId] : [],
    ),
  );
  const selectedRecipientResolution = resolveSelectedMeetingMaterialRecipients({
    members: memberDirectory,
    selectedUserIds: memberDirectory
      .filter((member) => member.status === "active")
      .map((member) => member.user_id),
  });
  const organizationRecipientOptions = selectedRecipientResolution.recipients.map(
    (recipient) => ({
      userId: recipient.userId!,
      name: recipient.name,
      email: recipient.email,
      isMeetingParticipant: participantUserIds.has(recipient.userId!),
    }),
  );
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
  const participantChipNames = [
    ...participants.internalParticipants
      .filter((participant) => participant.attendance_status !== "declined")
      .flatMap((participant) => {
        const member = memberDirectory.find(
          (candidate) => candidate.user_id === participant.user_id,
        );
        return member ? [member.full_name || member.email] : [];
      }),
    ...participants.externalAttendees.map((participant) => participant.name),
  ];
  const declinedParticipantUserIds = new Set(
    participants.internalParticipants
      .filter((participant) => participant.attendance_status === "declined")
      .map((participant) => participant.user_id),
  );
  const participantHeaderNames =
    participantChipNames.length > 0
      ? participantChipNames
      : emailRecipients
          .filter(
            (recipient) => !declinedParticipantUserIds.has(recipient.userId),
          )
          .map((recipient) => recipient.name);
  return (
    <div data-meeting-workspace>
      <MeetingDocumentHeader
        actions={
          <>
            {meetingCapabilities.sendAgendaEmail ? (
              <SendMeetingMaterialsModal
                committeeId={committeeId}
                initialHistory={dispatchHistory}
                meetingDateLabel={formatDateTime(meeting.starts_at, "full")}
                meetingId={meetingId}
                meetingTitle={meeting.title}
                minutesAvailable={Boolean(
                  minutes.meetingMinutes &&
                    ["ready_for_approval", "approved"].includes(
                      minutes.meetingMinutes.status,
                    ),
                )}
                organizationId={organizationId}
                participantSummary={{
                  recipientCount:
                    participantRecipientResolution.recipients.length,
                  totalParticipantCount:
                    participantRecipientResolution.totalParticipantCount,
                  participantsWithEmailCount:
                    participantRecipientResolution.participantsWithEmailCount,
                  unavailableParticipants:
                    participantRecipientResolution.unavailableParticipants,
                  usedCommitteeFallback:
                    participantRecipientResolution.usedCommitteeFallback,
                }}
                recipients={organizationRecipientOptions}
                relatedDocuments={[
                  ...documentContext.meetingDocuments,
                  ...documentContext.agendaItemDocuments,
                ]}
              />
            ) : null}
            <Dropdown label="Eksportér" panelId="meeting-export-actions">
              <div className="grid gap-1">
                <a
                  className="rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-ink hover:bg-subtle"
                  href={`/api/meetings/${meetingId}/agenda/pdf?organizationId=${organizationId}&committeeId=${committeeId}`}
                >
                  Download dagsorden
                </a>
                <a
                  className="rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-ink hover:bg-subtle"
                  href={`/api/meetings/${meetingId}/tasks/pdf?organizationId=${organizationId}&committeeId=${committeeId}`}
                >
                  Download opgaveliste PDF
                </a>
              </div>
            </Dropdown>
            <Dropdown
              className="meeting-actions-dropdown"
              label={
                <>
                  <AppIcon name="more" size={17} />
                  <span>Flere</span>
                </>
              }
              panelId="meeting-secondary-actions"
            >
              <div className="grid gap-1">
                <div className="[&>button]:w-full [&>button]:justify-start [&>button]:border-0 [&>button]:px-3 [&>button]:shadow-none">
                  <MeetingAiOverview
                    committeeId={committeeId}
                    meetingId={meetingId}
                    organizationId={organizationId}
                  />
                </div>
                {meetingCapabilities.updateMeeting ? (
                  <EditMeetingModal
                    committeeId={committeeId}
                    meeting={meeting}
                    organizationId={organizationId}
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
              </div>
            </Dropdown>
          </>
        }
        agendaItemCount={meeting.agenda_item_occurrences.length}
        backLink={
          <Link
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            href={`${root}/meetings`}
          >
            <AppIcon name="arrowLeft" size={14} />
            Tilbage til møder
          </Link>
        }
        committeeName={context.committee.name}
        meeting={meeting}
        minutesStatus={minutes.meetingMinutes?.status ?? null}
        participantSummary={{
          action: (
            <MeetingParticipantsPanel
              canEdit={meetingCapabilities.manageParticipants}
              committeeId={committeeId}
              compact
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
          names: participantHeaderNames,
        }}
        transferredItemCount={activeTransfers}
      />

      <section aria-label="Referat workspace" className="mt-1">
        <MeetingMinutesSection
          agendaAction={
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
          agendaItemAttachments={minutes.agendaItemAttachments}
          agendaItemHistoryMetadata={agendaItemHistoryMetadata}
          documentContext={documentContext}
          approvals={minutes.approvals}
          approvalRecipientInfo={approvalRecipientInfo}
          canApprove={minutes.canApprove}
          canEdit={meetingCapabilities.editOfficialMinutes}
          canUploadAttachments={meetingCapabilities.uploadMinutesAttachments}
          canEditAgendaItems={meetingCapabilities.updateAgendaItem}
          canEditPrivateNotes={meetingCapabilities.viewMeeting}
          canEditDecisions={canEditDecisions}
          canEditTasks={canEditTasks}
          committeeId={committeeId}
          decisionCategorySource={decisionContext.categorySource}
          decisionHistoryByAgendaItem={decisionContext.historyByAgendaItem}
          initialAgendaItemMinutes={minutes.agendaItemMinutes}
          initialMeetingMinutes={minutes.meetingMinutes}
          incomingTransfers={transferredAgendaItems.incomingItems}
          meetingAttachments={minutes.meetingAttachments}
          privateMeetingNote={minutes.privateMeetingNote}
          privateAgendaItemNotes={minutes.privateAgendaItemNotes}
          referentLock={minutes.referentLock}
          meetingId={meetingId}
          meetingTitle={meeting.title}
          meetingDate={meeting.starts_at}
          meetingDecisions={decisionContext.decisions}
          meetingTasks={taskContext.tasks}
          occurrences={meeting.agenda_item_occurrences}
          organizationId={organizationId}
          previousMeetingMinutes={previousMeetingMinutes}
          responsiblePeople={minutes.responsiblePeople}
          reviewSupplement={
            <TransferredAgendaItemsSection
              canEdit={meetingCapabilities.manageTransferredAgendaItems}
              futureMeetings={transferredAgendaItems.futureMeetings}
              items={transferredAgendaItems.items}
              root={root}
            />
          }
          taskCategorySource={taskContext.categorySource}
          root={root}
          userId={user.id}
        />
      </section>
    </div>
  );
}
