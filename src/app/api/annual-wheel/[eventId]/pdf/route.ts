import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { generateAnnualWheelEventPdf } from "@/lib/annual-wheel-pdf";
import { pdfContentDisposition, pdfFileSlug } from "@/lib/pdf-response";
import { createClient } from "@/lib/supabase/server";
import { AnnualWheelService } from "@/services/annual-wheel-service";
import { OrganizationBrandingService } from "@/services/organization-branding-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const organizationId =
      new URL(request.url).searchParams.get("organizationId") ?? "";
    const eventId = (await params).eventId;
    const db = await createClient();
    const { organization, event, members } = await new AnnualWheelService(
      db,
    ).getPdfData(organizationId, eventId);
    const branding = await new OrganizationBrandingService(db).getPdfBranding(
      organization.id,
      organization.name,
    );
    const pdf = await generateAnnualWheelEventPdf({
      organizationName: organization.name,
      event,
      members,
      exportedAt: new Date(),
      branding,
    });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Disposition": pdfContentDisposition(
          `${pdfFileSlug(event.title, "aarshjulsaktivitet")}-aarshjulsaktivitet.pdf`,
        ),
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
