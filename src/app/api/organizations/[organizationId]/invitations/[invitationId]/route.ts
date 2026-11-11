import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { OrganizationMemberService } from "@/services/organization-member-service";

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ organizationId: string; invitationId: string }> },
) {
  try {
    const { organizationId, invitationId } = await params;
    const result = await new OrganizationMemberService(
      await createClient(),
    ).resendInvitation(
      organizationId,
      invitationId,
      new URL(request.url).origin,
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
