import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { OrganizationBrandingService } from "@/services/organization-branding-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const body = await request.json();
    const branding = await new OrganizationBrandingService(
      await createClient(),
    ).saveTemplate(organizationId, body.config);
    return NextResponse.json({ branding });
  } catch (error) {
    return apiError(error);
  }
}
