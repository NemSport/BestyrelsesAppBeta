import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { generateAnnualWheelVisualPdf } from "@/lib/annual-wheel-overview-pdf";
import { createClient } from "@/lib/supabase/server";
import { AnnualWheelService } from "@/services/annual-wheel-service";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { OrganizationBrandingService } from "@/services/organization-branding-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const searchParams = new URL(request.url).searchParams;
    const requestedYear = Number(searchParams.get("year"));
    const committeeId = searchParams.get("committeeId");
    const db = await createClient();
    const user = await new AuthService(db).requireUser();
    const context = await new AuthorizationService(
      db,
    ).requireOrganizationMember(organizationId, user.id);
    const overview = await new AnnualWheelService(db).getOverview(
      organizationId,
      Number.isFinite(requestedYear) ? requestedYear : undefined,
    );
    const branding = await new OrganizationBrandingService(db).getPdfBranding(
      organizationId,
      context.organization.name,
    );
    const pdf = await generateAnnualWheelVisualPdf({
      organizationName: context.organization.name,
      overview,
      exportedAt: new Date(),
      committeeId,
      branding,
    });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Disposition": `attachment; filename="aarshjul-${overview.year}.pdf"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
