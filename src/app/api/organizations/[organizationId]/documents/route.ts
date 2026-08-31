import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { DocumentService } from "@/services/document-service";
import type { DocumentRelationType } from "@/types/documents";

export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const { organizationId } = await params;
    return NextResponse.json(
      await new DocumentService(await createClient()).getPickerData(organizationId),
    );
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const { organizationId } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Fil mangler.", 422, "FILE_REQUIRED");
    const document = await new DocumentService(await createClient()).upload({
      organizationId, file, name: String(form.get("name") ?? ""),
      categoryId: String(form.get("categoryId") || "") || null,
      committeeId: String(form.get("committeeId") || "") || null,
      description: String(form.get("description") || "") || null,
      relationType: (String(form.get("relationType") || "") || null) as DocumentRelationType | null,
      relationId: String(form.get("relationId") || "") || null,
    });
    return NextResponse.json(document, { status: 201 });
  } catch (error) { return apiError(error); }
}
