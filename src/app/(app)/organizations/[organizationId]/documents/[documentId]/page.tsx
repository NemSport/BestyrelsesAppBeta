import { notFound } from "next/navigation";
import { DocumentDetail } from "@/components/documents/document-detail";
import { createClient } from "@/lib/supabase/server";
import { DocumentService } from "@/services/document-service";

export default async function DocumentDetailPage({ params }: { params: Promise<{ organizationId: string; documentId: string }> }) {
  const { organizationId, documentId } = await params; const service = new DocumentService(await createClient());
  const [detail, register] = await Promise.all([service.getDetail(documentId).catch(() => null), service.getRegister(organizationId)]);
  if (!detail || detail.organization_id !== organizationId) notFound();
  return <DocumentDetail categories={register.categories} committees={register.committees} detail={detail} />;
}
