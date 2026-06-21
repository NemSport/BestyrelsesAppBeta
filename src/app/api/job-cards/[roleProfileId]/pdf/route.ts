import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { generateJobCardPdf } from "@/lib/job-card-pdf";
import { createClient } from "@/lib/supabase/server";
import { JobCardService } from "@/services/job-card-service";
import { OrganizationBrandingService } from "@/services/organization-branding-service";

function fileSlug(value: string) {
  return (
    value
      .toLocaleLowerCase("da-DK")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/æ/g, "ae")
      .replace(/ø/g, "oe")
      .replace(/å/g, "aa")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "jobkort"
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roleProfileId: string }> },
) {
  try {
    const { roleProfileId } = await params;
    const organizationId = new URL(request.url).searchParams.get(
      "organizationId",
    );

    const db = await createClient();
    const { organization, role } = await new JobCardService(db).getPdfData(
      organizationId ?? "",
      roleProfileId,
    );
    const branding = await new OrganizationBrandingService(db).getPdfBranding(
      organization.id,
      organization.name,
    );

    const pdf = await generateJobCardPdf({
      organizationName: organization.name,
      role,
      exportedAt: new Date(),
      branding,
    });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Disposition": `attachment; filename="${fileSlug(
          role.title,
        )}-jobkort.pdf"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
