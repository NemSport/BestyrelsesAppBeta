import { notFound } from "next/navigation";

import { OrganizationWorkspace } from "@/components/layout/organization-workspace";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { OrganizationBrandingService } from "@/services/organization-branding-service";
import { CommitteeService } from "@/services/committee-service";
import { getMeetingCapabilities } from "@/lib/permissions";

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
  const [committees, branding] = await Promise.all([
    new CommitteeService(db).list(organizationId),
    new OrganizationBrandingService(db).getSafeBranding(organizationId),
  ]);
  const committeeOptions = await Promise.all(
    committees.map(async (committee) => {
      const committeeContext = await new AuthorizationService(
        db,
      ).requireCommitteeMember(organizationId, committee.id, user.id);
      return {
        id: committee.id,
        name: committee.name,
        capabilities: getMeetingCapabilities(
          committeeContext.organizationMembership.role,
          committeeContext.membership?.role ?? null,
        ),
      };
    }),
  );

  return (
    <OrganizationWorkspace
      branding={branding}
      committees={committeeOptions}
      organizationId={organizationId}
      organizationName={context.organization.name}
    >
      {children}
    </OrganizationWorkspace>
  );
}
