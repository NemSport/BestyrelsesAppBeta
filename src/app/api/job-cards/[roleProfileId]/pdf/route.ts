import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { generateJobCardPdf } from "@/lib/job-card-pdf";
import { createClient } from "@/lib/supabase/server";
import { JobCardService } from "@/services/job-card-service";

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

    const { organization, role } = await new JobCardService(
      await createClient(),
    ).getPdfData(organizationId ?? "", roleProfileId);

    const pdf = await generateJobCardPdf({
      organizationName: organization.name,
      role,
      exportedAt: new Date(),
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
