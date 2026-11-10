import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { OrganizationBrandingService } from "@/services/organization-branding-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return NextResponse.json(
        { error: "Vælg et PNG- eller JPG-billede." },
        { status: 422 },
      );
    return NextResponse.json(
      await new OrganizationBrandingService(
        await createClient(),
      ).uploadLetterhead(organizationId, file),
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const path = new URL(request.url).searchParams.get("path") ?? "";
    const bytes = await new OrganizationBrandingService(
      await createClient(),
    ).readLetterhead(organizationId, path);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": path.endsWith(".png") ? "image/png" : "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
