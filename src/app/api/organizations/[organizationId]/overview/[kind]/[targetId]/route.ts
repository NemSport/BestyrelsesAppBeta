import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";

const scope = z.object({
  organizationId: z.string().uuid(),
  targetId: z.string().uuid(),
  kind: z.enum(["meeting", "poll"]),
});

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string; kind: string; targetId: string }>;
  },
) {
  try {
    const { organizationId, kind, targetId } = scope.parse(await params);
    const db = await createClient();
    const user = await new AuthService(db).requireUser();
    await new AuthorizationService(db).requireOrganizationMember(
      organizationId,
      user.id,
    );
    const email = user.email?.toLowerCase();
    if (!email || !user.email_confirmed_at)
      throw new AppError("Mangler en bekræftet mailadresse.", 403);
    const admin = createAdminClient();
    const root = `/organizations/${organizationId}`;
    let destination = root;

    if (kind === "poll") {
      const { data: poll, error } = await admin
        .from("meeting_date_polls")
        .select("id, meeting_id, options")
        .eq("organization_id", organizationId)
        .eq("id", targetId)
        .maybeSingle();
      if (error) throw error;
      if (
        poll &&
        !poll.meeting_id &&
        poll.options.some((option) => Date.parse(option) > Date.now())
      ) {
        const { data: voter, error: voterError } = await admin
          .from("meeting_date_poll_voters")
          .select("token")
          .eq("poll_id", poll.id)
          .eq("email", email)
          .not("sent_at", "is", null)
          .maybeSingle();
        if (voterError) throw voterError;
        if (voter) destination = `/meeting-vote/${voter.token}`;
      }
    } else {
      const { data: meeting, error } = await admin
        .from("meetings")
        .select("id, starts_at, committee_id")
        .eq("organization_id", organizationId)
        .eq("id", targetId)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .maybeSingle();
      if (error) throw error;
      if (meeting) {
        const { data: invite, error: inviteError } = await admin
          .from("meeting_invitation_responses")
          .select("token")
          .eq("meeting_id", meeting.id)
          .eq("starts_at", meeting.starts_at)
          .eq("email", email)
          .not("sent_at", "is", null)
          .maybeSingle();
        if (invite) destination = `/meeting-response/${invite.token}`;
        if (inviteError) throw inviteError;
      }
    }
    const response = NextResponse.redirect(new URL(destination, request.url));
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    return apiError(error);
  }
}
