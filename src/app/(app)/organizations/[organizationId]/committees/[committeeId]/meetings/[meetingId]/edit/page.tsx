import { notFound } from "next/navigation";

import { MeetingEditForm } from "@/components/meetings/meeting-edit-form";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { MeetingService } from "@/services/meeting-service";

export default async function EditMeetingPage({
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
  const allowed = await new AuthorizationService(db)
    .requireCommitteeManager(organizationId, committeeId, user.id)
    .catch(() => null);
  if (!allowed) notFound();
  const meeting = await new MeetingService(db)
    .get(organizationId, committeeId, meetingId)
    .catch(() => null);
  if (!meeting) notFound();
  const root = `/organizations/${organizationId}/committees/${committeeId}`;

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="text-2xl font-bold">Rediger møde</h2>
      <p className="mt-2 text-sm text-slate-600">
        Opdater mødetid og mødedetaljer.
      </p>
      <div className="panel mt-6 p-6">
        <MeetingEditForm
          committeeId={committeeId}
          meeting={meeting}
          organizationId={organizationId}
          successPath={`${root}/meetings/${meetingId}`}
        />
      </div>
    </div>
  );
}
