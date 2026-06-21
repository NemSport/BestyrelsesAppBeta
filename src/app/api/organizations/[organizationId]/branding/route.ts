import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { OrganizationBrandingService } from "@/services/organization-branding-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await params;
  try {
    const branding = await new OrganizationBrandingService(
      await createClient(),
    ).update({
      ...(await request.json()),
      organizationId,
    });
    return NextResponse.json(branding);
  } catch (error) {
    return apiError(error);
  }
}
