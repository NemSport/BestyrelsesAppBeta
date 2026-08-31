import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { DocumentService } from "@/services/document-service";

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Fil mangler.", 422, "FILE_REQUIRED");
    return NextResponse.json(await new DocumentService(await createClient()).replace((await params).documentId, file), { status: 201 });
  } catch (error) { return apiError(error); }
}
