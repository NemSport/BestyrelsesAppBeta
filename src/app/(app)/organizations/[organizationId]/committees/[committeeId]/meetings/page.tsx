import Link from "next/link";

import { MeetingAgendaPreview } from "@/components/meetings/meeting-agenda-preview";
import {
  EmptyState,
  PageSection,
  StatusBadge,
  buttonClassName,
} from "@/components/ui";
import { formatDateTime, meetingStatusLabels } from "@/lib/localization";
import { canManageCommittee } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { MeetingService } from "@/services/meeting-service";

export default async function MeetingsPage({
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
  const meetings = await new MeetingService(db).list(
    organizationId,
    committeeId,
  );
  const root = `/organizations/${organizationId}/committees/${committeeId}`;
  const canEdit = canManageCommittee(
    context.organizationMembership.role,
    context.membership?.role ?? null,
  );

  return (
    <PageSection
      actions={
        canEdit ? (
          <Link className={buttonClassName()} href={`${root}/meetings/new`}>
            Nyt møde
          </Link>
        ) : null
      }
      description="Planlæg, afhold og følg op på udvalgets møder."
      eyebrow="Møder"
      title="Mødeplan"
    >
      {meetings.length > 0 ? (
        <div className="divide-y divide-line border-y border-line">
          {meetings.map((meeting) => (
            <article
              className="px-1 py-5 transition hover:bg-surface/60 sm:px-3"
              key={meeting.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold">{meeting.title}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {formatDateTime(meeting.starts_at)}
                    {meeting.location ? ` · ${meeting.location}` : ""}
                  </p>
                </div>
                <StatusBadge
                  tone={
                    meeting.status === "completed"
                      ? "success"
                      : meeting.status === "cancelled"
                        ? "danger"
                        : "info"
                  }
                >
                  {meetingStatusLabels[meeting.status]}
                </StatusBadge>
              </div>

              <MeetingAgendaPreview
                occurrences={meeting.agenda_item_occurrences}
              />

              <Link
                className="mt-3 inline-flex text-sm font-semibold text-brand hover:underline"
                href={`${root}/meetings/${meeting.id}`}
              >
                Åbn hele mødet
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          description="Opret et møde for at samle dagsorden, referat og opfølgning."
          title="Der er endnu ikke oprettet nogen møder."
        />
      )}
    </PageSection>
  );
}
