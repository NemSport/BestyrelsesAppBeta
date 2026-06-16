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
        <div className="grid gap-2">
          {meetings.map((meeting) => (
            <article
              className="rounded-[var(--radius-panel)] border border-line bg-surface/80 px-3 py-3 transition hover:border-brand/30 hover:bg-surface sm:px-4"
              key={meeting.id}
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <Link
                    className="font-semibold text-ink hover:text-brand hover:underline"
                    href={`${root}/meetings/${meeting.id}`}
                  >
                    {meeting.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDateTime(meeting.starts_at)}
                    {meeting.location ? ` · ${meeting.location}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
                  <Link
                    className="text-sm font-semibold text-brand hover:underline"
                    href={`${root}/meetings/${meeting.id}`}
                  >
                    Åbn møde
                  </Link>
                </div>
              </div>

              <MeetingAgendaPreview
                occurrences={meeting.agenda_item_occurrences}
              />
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
