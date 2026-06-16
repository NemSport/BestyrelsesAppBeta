import { notFound } from "next/navigation";

import { AgendaItemCreateForm } from "@/components/agenda-items/agenda-item-create-form";
import { canManageCommittee } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { MeetingService } from "@/services/meeting-service";

export default async function NewAgendaItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; committeeId: string }>;
  searchParams: Promise<{ meetingId?: string }>;
}) {
  const { organizationId, committeeId } = await params;
  const { meetingId } = await searchParams;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const authorization = new AuthorizationService(db);
  const allowed = await (meetingId
    ? authorization.requireCommitteeManager(
        organizationId,
        committeeId,
        user.id,
      )
    : authorization.requireAgendaItemEditor(
        organizationId,
        committeeId,
        user.id,
      )
  ).catch(() => null);
  if (!allowed) notFound();
  const canScheduleMeeting = canManageCommittee(
    allowed.organizationMembership.role,
    allowed.membership?.role ?? null,
  );
  const meetings = (await new MeetingService(db).list(
    organizationId,
    committeeId,
  ))
    .filter(
      (meeting) =>
        meeting.status !== "cancelled" &&
        (meeting.id === meetingId ||
          new Date(meeting.starts_at).getTime() >= Date.now()),
    )
    .sort(
      (left, right) =>
        new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime(),
    )
    .map(({ id, title, starts_at }) => ({ id, title, starts_at }));
  const root = `/organizations/${organizationId}/committees/${committeeId}`;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-semibold uppercase tracking-wider text-forest">
        Et vedvarende emne
      </p>
      <h2 className="mt-2 text-2xl font-bold">Opret dagsordenspunkt</h2>
      <p className="mt-2 text-sm text-slate-600">
        Emnet kan planlægges på flere møder uden at miste sin historik.
      </p>
      <div className="panel mt-6 p-6">
        <AgendaItemCreateForm
          allowMeetingSelection={canScheduleMeeting}
          committeeId={committeeId}
          meetingId={meetingId}
          meetings={meetings}
          organizationId={organizationId}
          successPath={`${root}/agenda-items/:id`}
          submitLabel="Opret dagsordenspunkt"
        />
      </div>
    </div>
  );
}
