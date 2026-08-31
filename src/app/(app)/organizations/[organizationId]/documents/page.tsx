import { DocumentRegister } from "@/components/documents/document-register";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { DocumentService } from "@/services/document-service";

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ committee?: string; upload?: string }>;
}) {
  const { organizationId } = await params;
  const query = await searchParams;
  const data = await new DocumentService(await createClient()).getRegister(
    organizationId,
  );
  const initialCommitteeId = data.committees.some(
    (item) => item.id === query.committee,
  )
    ? query.committee
    : "";
  return (
    <div className="page-flow w-full max-w-none" data-document-register-page>
      <PageHeader
        eyebrow="Organisationens arkiv"
        title="Dokumenter"
        description="Find, kategorisér og genbrug dokumenter på tværs af udvalg og arbejdsområder."
      />
      <DocumentRegister
        organizationId={organizationId}
        data={data}
        initialCommitteeId={initialCommitteeId}
        openUploadOnLoad={query.upload === "1"}
      />
    </div>
  );
}
