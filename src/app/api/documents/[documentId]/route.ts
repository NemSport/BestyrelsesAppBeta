import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { DocumentService } from "@/services/document-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try { return NextResponse.json(await new DocumentService(await createClient()).update((await params).documentId, await request.json())); }
  catch (error) { return apiError(error); }
}
export async function DELETE(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try { await new DocumentService(await createClient()).softDelete((await params).documentId); return NextResponse.json({ message: "Dokumentet er slettet fra arkivet." }); }
  catch (error) { return apiError(error); }
}
