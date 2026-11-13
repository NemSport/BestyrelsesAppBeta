import Link from "next/link";

import { BestieAgendaSuggestions } from "@/components/meetings/bestie-agenda-suggestions";
import { MinuteAttachments } from "@/components/meetings/minutes-governance";
import { PageHeader, buttonClassName } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/localization";
import { getTaskDetailPath } from "@/lib/task-register-state";
import type { TaskService } from "@/services/task-service";
import type { MeetingDocumentContext } from "@/types/documents";
import type { MeetingWithAgenda, MinuteAttachmentView } from "@/types/domain";

export function MeetingPreparation({
  meeting,
  back,
  meetingHref,
  attachments,
  documents,
  tasks,
  canSuggestAgenda,
}: {
  meeting: MeetingWithAgenda;
  back: { href: string; label: string };
  meetingHref: string;
  attachments: MinuteAttachmentView[];
  documents: MeetingDocumentContext;
  canSuggestAgenda: boolean;
  tasks: Awaited<ReturnType<TaskService["getMeetingReviewTasks"]>>["tasks"];
}) {
  const {
    id: meetingId,
    committee_id: committeeId,
    organization_id: organizationId,
  } = meeting;
  const scope = { organizationId, committeeId, meetingId };
  const agenda = meeting.agenda_item_occurrences.flatMap(
    ({ id, agenda_items }) =>
      agenda_items ? [{ id, item: agenda_items }] : [],
  );
  const meetingAttachments = attachments.filter(
    ({ agendaItemId }) => !agendaItemId,
  );
  const hasMeetingAttachments =
    meetingAttachments.length > 0 || documents.meetingDocuments.length > 0;
  const hasAgendaAttachments =
    attachments.some(({ agendaItemId }) => agendaItemId) ||
    documents.agendaItemDocuments.length > 0;

  return (
    <div className="section-stack">
      <Link
        className="w-fit text-sm text-brand hover:underline"
        href={back.href}
      >
        {back.label}
      </Link>
      <PageHeader
        eyebrow="Mødeforberedelse"
        title={meeting.title}
        description={[
          formatDateTime(meeting.starts_at, "full"),
          meeting.location,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <Link
            className={buttonClassName({ variant: "secondary", size: "sm" })}
            href={meetingHref}
          >
            Åbn møde
          </Link>
        }
      />
      {canSuggestAgenda ? <BestieAgendaSuggestions {...scope} /> : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="panel p-4" aria-labelledby="preparation-agenda">
          <h2 className="font-semibold" id="preparation-agenda">
            Dagsorden
          </h2>
          {agenda.length ? (
            <ol className="mt-2 list-decimal divide-y divide-line pl-6">
              {agenda.map(({ id, item }) => {
                const files = attachments.filter(
                  ({ agendaItemId }) => agendaItemId === item.id,
                );
                const related = documents.agendaItemDocuments.filter(
                  ({ agendaItemId }) => agendaItemId === item.id,
                );
                return (
                  <li className="py-2" key={id}>
                    <Link
                      className="font-medium text-brand hover:underline"
                      href={`${meetingHref}#agenda-point-${id}`}
                    >
                      {item.title}
                    </Link>
                    {files.length || related.length ? (
                      <MinuteAttachments
                        {...scope}
                        agendaItemId={item.id}
                        attachments={files}
                        relatedDocuments={related}
                        canEdit={false}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Der er endnu ingen dagsordenspunkter.
            </p>
          )}
        </section>
        <div className="grid gap-4">
          <section className="panel p-4" aria-labelledby="preparation-files">
            <h2 className="font-semibold" id="preparation-files">
              Mødebilag
            </h2>
            {hasMeetingAttachments ? (
              <MinuteAttachments
                {...scope}
                attachments={meetingAttachments}
                relatedDocuments={documents.meetingDocuments}
                canEdit={false}
              />
            ) : (
              <p className="mt-2 text-sm text-muted">
                {hasAgendaAttachments
                  ? "Bilagene ligger under de enkelte dagsordenspunkter."
                  : "Der er ingen bilag til mødet."}
              </p>
            )}
          </section>
          <section className="panel p-4" aria-labelledby="preparation-tasks">
            <h2 className="font-semibold" id="preparation-tasks">
              Relevante åbne opgaver
            </h2>
            {tasks.length ? (
              <ul className="mt-2 divide-y divide-line">
                {tasks.map((task) => (
                  <li className="py-2" key={task.id}>
                    <Link
                      className="font-medium text-brand hover:underline"
                      href={`/organizations/${organizationId}${getTaskDetailPath(task.id, committeeId)}`}
                    >
                      {task.title}
                    </Link>
                    {task.responsible?.full_name || task.deadline ? (
                      <p className="mt-1 text-sm text-muted">
                        {[
                          task.responsible?.full_name,
                          task.deadline && `Frist ${formatDate(task.deadline)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Der er ingen relevante åbne opgaver.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
