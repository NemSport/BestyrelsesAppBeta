import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { OrganizationPdfPreviewService } from "@/services/organization-pdf-preview-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    return NextResponse.json(
      {
        meetings: await new OrganizationPdfPreviewService(
          await createClient(),
        ).listMeetings((await params).organizationId),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const result = await new OrganizationPdfPreviewService(
      await createClient(),
    ).generate((await params).organizationId, await request.json());
    return new NextResponse(Buffer.from(result.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="forhaandsvisning.pdf"',
        "X-PDF-Page-Count": String(result.pages),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
