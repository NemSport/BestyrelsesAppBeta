import { notFound } from "next/navigation";

import { OrganizationWorkspace } from "@/components/layout/organization-workspace";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { CommitteeService } from "@/services/committee-service";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db)
    .requireOrganizationMember(organizationId, user.id)
    .catch(() => null);

  if (!context) notFound();
  const committees = await new CommitteeService(db).list(organizationId);

  return (
    <OrganizationWorkspace
      committees={committees.map((committee) => ({
        id: committee.id,
        name: committee.name,
      }))}
      organizationId={organizationId}
      organizationName={context.organization.name}
    >
      {children}
    </OrganizationWorkspace>
  );
}
