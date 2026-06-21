import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { OrganizationBrandingService } from "@/services/organization-branding-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await params;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Vælg en logofil." },
        { status: 422 },
      );
    }

    const branding = await new OrganizationBrandingService(
      await createClient(),
    ).uploadLogo({
      organizationId,
      file,
    });

    return NextResponse.json({
      branding,
      message: "Logoet er uploadet.",
    });
  } catch (error) {
    return apiError(error);
  }
}
