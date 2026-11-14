import { notFound } from "next/navigation";

import { ContractImport } from "@/components/stakeholders/contract-import";
import { getStakeholderCapabilities } from "@/lib/stakeholder-capabilities";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";

export default async function ContractImportPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db)
    .requireOrganizationMember(organizationId, user.id)
    .catch(() => null);
  if (
    !context ||
    !getStakeholderCapabilities(context.membership.role).manageContracts
  )
    notFound();
  return <ContractImport organizationId={organizationId} />;
}
