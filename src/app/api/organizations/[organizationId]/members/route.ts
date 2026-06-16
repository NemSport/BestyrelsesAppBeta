import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { OrganizationMemberService } from "@/services/organization-member-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    return NextResponse.json(
      await new OrganizationMemberService(await createClient()).list(organizationId),
    );
  } catch (error) {
    return apiError(error);
  }
}
