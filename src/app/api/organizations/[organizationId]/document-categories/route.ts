import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { DocumentService } from "@/services/document-service";

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  try { const body = await request.json(); return NextResponse.json(await new DocumentService(await createClient()).createCategory((await params).organizationId, String(body.name ?? "")), { status: 201 }); }
  catch (error) { return apiError(error); }
}
