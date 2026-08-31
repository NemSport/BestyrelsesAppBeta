import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { DocumentService } from "@/services/document-service";

export async function GET(request: Request, { params }: { params: Promise<{ documentId: string; versionId: string }> }) {
  try {
    const { documentId, versionId } = await params;
    const download = new URL(request.url).searchParams.get("download") === "1";
    const result = await new DocumentService(await createClient()).getVersionDownload(documentId, versionId, download);
    return NextResponse.redirect(result.url);
  } catch (error) { return apiError(error); }
}
