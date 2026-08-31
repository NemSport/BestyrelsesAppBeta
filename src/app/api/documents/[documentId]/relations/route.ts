import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { DocumentService } from "@/services/document-service";
import type { DocumentRelationType } from "@/types/documents";

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const body = await request.json();
    const service = new DocumentService(await createClient());
    const documentId = (await params).documentId;
    const relation = body.attachExisting
      ? await service.attachExisting(documentId, body.relationType as DocumentRelationType, body.relationId ?? null)
      : await service.addRelation(documentId, body.relationType as DocumentRelationType, body.relationId ?? null);
    return NextResponse.json(relation, { status: 201 });
  }
  catch (error) { return apiError(error); }
}
