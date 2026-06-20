import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createBearerClient } from "@/lib/supabase/bearer";
import { OrganizationService } from "@/services/organization-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const overview = await new OrganizationService(
      createBearerClient(request),
    ).getOverview(organizationId);
    return NextResponse.json({
      upcomingMeetings: overview.upcomingMeetings,
      recentMinutes: overview.recentMinutes,
    });
  } catch (error) {
    return apiError(error);
  }
}
