import { notFound } from "next/navigation";

import { MeetingEditForm } from "@/components/meetings/meeting-edit-form";
import { PageHeader } from "@/components/ui";
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
    <div className="max-w-3xl">
      <PageHeader
        className="mb-6"
        description="Opdater mødetid og mødedetaljer."
        eyebrow="Møde"
        title="Rediger møde"
      />
      <div className="border-y border-line py-5">
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
