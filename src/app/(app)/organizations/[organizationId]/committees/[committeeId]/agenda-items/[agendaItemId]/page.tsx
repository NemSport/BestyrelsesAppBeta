import Link from "next/link";
import { notFound } from "next/navigation";

import { AgendaItemDocumentTitle } from "@/components/agenda-items/agenda-item-document-title";
import { AgendaItemAssistant } from "@/components/agenda-items/agenda-item-assistant";
import { EditAgendaItemModal } from "@/components/agenda-items/edit-agenda-item-modal";
import { DecisionHistory } from "@/components/decisions/decision-history";
import { RelatedTasks } from "@/components/tasks/related-tasks";
import { TaskCreateModal } from "@/components/tasks/task-create-modal";
import {
  ContentPanel,
  DocumentPanel,
  EmptyState,
  PageHeader,
  PageSection,
  StatusBadge,
} from "@/components/ui";
import {
  formatDate,
  occurrenceStatusLabels,
  standardAgendaItemLabels,
} from "@/lib/localization";
import { canEditAgendaItems } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { AgendaItemService } from "@/services/agenda-item-service";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { DecisionService } from "@/services/decision-service";
import { TaskService } from "@/services/task-service";

export default async function AgendaItemPage({
  params,
}: {
  params: Promise<{
    organizationId: string;
    committeeId: string;
    agendaItemId: string;
  }>;
}) {
  const { organizationId, committeeId, agendaItemId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db).requireCommitteeMember(
    organizationId,
    committeeId,
    user.id,
  );
  const item = await new AgendaItemService(db)
    .get(organizationId, committeeId, agendaItemId)
    .catch(() => null);
  if (!item) notFound();
  const [decisionHistory, taskContext] = await Promise.all([
    new DecisionService(db).getAgendaItemHistory(
      organizationId,
      committeeId,
      agendaItemId,
    ),
    new TaskService(db).getAgendaItemContext(
      organizationId,
      committeeId,
      agendaItemId,
    ),
  ]);
  const canEdit = canEditAgendaItems(
    context.organizationMembership.role,
    context.membership?.role ?? null,
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div>
        <PageHeader
          actions={
            <div className="flex flex-wrap gap-2">
              {taskContext.canEdit ? (
                <TaskCreateModal
                  agendaItems={[{ id: item.id, title: item.title }]}
                  categorySource={taskContext.categorySource}
                  committeeId={committeeId}
                  initialAgendaItemId={item.id}
                  initialDescription={item.description}
                  initialMeetingId={
                    item.agenda_item_occurrences[0]?.meetings?.id ?? ""
                  }
                  initialTitle={item.title}
                  meetings={item.agenda_item_occurrences.flatMap((occurrence) =>
                    occurrence.meetings ? [occurrence.meetings] : [],
                  )}
                  organizationId={organizationId}
                  responsiblePeople={taskContext.responsiblePeople}
                  sourceLabel="dagsordenspunktet"
                  triggerLabel="Opret opgave fra dette punkt"
                />
              ) : null}
              {canEdit ? (
                <EditAgendaItemModal
                  committeeId={committeeId}
                  item={item}
                  organizationId={organizationId}
                />
              ) : null}
            </div>
          }
          eyebrow={
            <span className="flex flex-wrap items-center gap-2 normal-case tracking-normal">
              {item.standard_key ? (
                <StatusBadge>
                  {standardAgendaItemLabels[item.standard_key]}
                </StatusBadge>
              ) : (
                "Dagsordenspunkt"
              )}
            </span>
          }
          title={
            <AgendaItemDocumentTitle
              title={item.title}
              type={item.item_type}
            />
          }
        />

        <DocumentPanel className="mt-6">
          <p className="page-eyebrow">Formål</p>
          <p className="mt-3 whitespace-pre-wrap text-lg leading-8">
            {item.objective || "Der er endnu ikke angivet et formål."}
          </p>
        </DocumentPanel>

        <AgendaItemAssistant
          agendaItemId={agendaItemId}
          committeeId={committeeId}
          organizationId={organizationId}
        />

        <PageSection
          className="mt-8"
          description="Hver mødeforekomst forbliver knyttet til dette dagsordenspunkt."
          title="Historisk kontekst"
        >
          {item.agenda_item_occurrences.length > 0 ? (
            <div className="divide-y divide-line border-y border-line">
              {item.agenda_item_occurrences.map((occurrence) => {
                const meeting = occurrence.meetings;
                if (!meeting) return null;
                return (
                  <Link
                    className="block px-1 py-5 transition hover:bg-surface/60 sm:px-3"
                    href={`/organizations/${organizationId}/committees/${committeeId}/meetings/${meeting.id}`}
                    key={occurrence.id}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-semibold">{meeting.title}</h3>
                      <time className="text-xs text-muted">
                        {formatDate(meeting.starts_at)}
                      </time>
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      {occurrenceStatusLabels[occurrence.meeting_status]}
                    </p>
                    {occurrence.outcome_summary ? (
                      <p className="mt-3 text-sm">{occurrence.outcome_summary}</p>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Dagsordenspunktet er endnu ikke planlagt på et møde." />
          )}
        </PageSection>

        <PageSection
          className="mt-8"
          description="Tidligere beslutninger i samme udvalg med samme kategori som beslutninger fra dette punkt."
          title="Tidligere beslutninger om dette emne"
        >
          <DecisionHistory
            history={decisionHistory}
            organizationId={organizationId}
          />
        </PageSection>

        <PageSection
          className="mt-8"
          description="Konkrete handlinger, der er knyttet til dette dagsordenspunkt."
          title="Relaterede opgaver"
        >
          {taskContext.tasks.length ? (
            <RelatedTasks
              organizationId={organizationId}
              tasks={taskContext.tasks}
            />
          ) : (
            <EmptyState title="Der er ingen relaterede opgaver." />
          )}
        </PageSection>
      </div>

      <aside className="space-y-4">
        <ContentPanel className="p-6">
          <h2 className="font-semibold">Baggrund</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">
            {item.description || "Der er endnu ikke angivet en baggrund."}
          </p>
        </ContentPanel>
        <ContentPanel className="p-6">
          <h2 className="font-semibold">Detaljer</h2>
          <dl className="mt-4 divide-y divide-line text-sm">
            <div className="py-3 first:pt-0">
              <dt className="text-muted">Måldato</dt>
              <dd className="mt-1">{item.target_date || "Ikke angivet"}</dd>
            </div>
            <div className="py-3 last:pb-0">
              <dt className="text-muted">Oprettet</dt>
              <dd className="mt-1">{formatDate(item.created_at)}</dd>
            </div>
          </dl>
        </ContentPanel>
      </aside>
    </div>
  );
}
