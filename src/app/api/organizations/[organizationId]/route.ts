import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { OrganizationService } from "@/services/organization-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const organization = await new OrganizationService(await createClient()).update({
      ...(await request.json()),
      organizationId: (await params).organizationId,
    });
    return NextResponse.json(organization);
  } catch (error) {
    return apiError(error);
  }
}
