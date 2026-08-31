import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { DocumentService } from "@/services/document-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; categoryId: string }> }) {
  try { const { organizationId, categoryId } = await params; return NextResponse.json(await new DocumentService(await createClient()).updateCategory(organizationId, categoryId, await request.json())); }
  catch (error) { return apiError(error); }
}
