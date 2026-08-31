import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { DocumentService } from "@/services/document-service";

export async function DELETE(request: Request, { params }: { params: Promise<{ documentId: string; relationId: string }> }) {
  try {
    const { documentId, relationId } = await params;
    const service = new DocumentService(await createClient());
    if (new URL(request.url).searchParams.get("context") === "1") {
      await service.detachExisting(documentId, relationId);
    } else {
      await service.removeRelation(documentId, relationId);
    }
    return NextResponse.json({ message: "Relationen er fjernet. Dokumentet er bevaret." });
  }
  catch (error) { return apiError(error); }
}
