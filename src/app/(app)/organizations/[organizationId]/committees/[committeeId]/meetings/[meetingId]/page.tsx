import { notFound } from "next/navigation";

import { DecisionCreateModal } from "@/components/decisions/decision-create-modal";
import { RelatedDecisions } from "@/components/decisions/related-decisions";
import { AddAgendaItemModal } from "@/components/meetings/add-agenda-item-modal";
import { EditMeetingModal } from "@/components/meetings/edit-meeting-modal";
import { MeetingDocumentHeader } from "@/components/meetings/meeting-document-header";
import { MeetingMinutesSection } from "@/components/meetings/meeting-minutes-section";
import { TransferredAgendaItemsSection } from "@/components/meetings/transferred-agenda-items-section";
import { RelatedTasks } from "@/components/tasks/related-tasks";
import { TaskCreateModal } from "@/components/tasks/task-create-modal";
import { PageSection } from "@/components/ui";
import { canManageCommittee } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { DecisionService } from "@/services/decision-service";
import { MeetingMinutesService } from "@/services/meeting-minutes-service";
import { MeetingService } from "@/services/meeting-service";
import { TaskService } from "@/services/task-service";
import { TransferredAgendaItemService } from "@/services/transferred-agenda-item-service";

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

  return (
    <div>
      <MeetingDocumentHeader
        actions={
          canEditMeeting ? (
            <EditMeetingModal
              committeeId={committeeId}
              meeting={meeting}
              organizationId={organizationId}
            />
          ) : null
        }
        agendaItemCount={meeting.agenda_item_occurrences.length}
        attendeeCount={attendeeCount}
        committeeName={context.committee.name}
        meeting={meeting}
        minutesStatus={minutes.meetingMinutes?.status ?? null}
        transferredItemCount={activeTransfers}
      />

      <PageSection
        actions={
          <div className="flex flex-wrap gap-2">
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
        className="mt-8"
        description="Arbejd gennem dagsordenen punkt for punkt. Noter, beslutninger og opfølgning samles i referatet."
        eyebrow="Mødedokument"
        title="Dagsorden og referat"
      >
        {decisionContext.decisions.length > 0 || taskContext.tasks.length > 0 ? (
          <details className="group mb-6 rounded-[var(--radius-panel)] border border-line bg-subtle/20">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
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
            <div className="grid gap-5 border-t border-line p-4 lg:grid-cols-2">
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
