import { notFound } from "next/navigation";

import { ResourceForm } from "@/components/forms/resource-form";
import { OrganizationBrandingForm } from "@/components/organizations/organization-branding-form";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { OrganizationBrandingService } from "@/services/organization-branding-service";

export default async function EditOrganizationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db)
    .requireOrganizationAdmin(organizationId, user.id)
    .catch(() => null);
  if (!context) notFound();
  const branding = await new OrganizationBrandingService(
    db,
  ).getEditableBranding(organizationId);

  return (
    <div className="max-w-5xl">
      <PageHeader
        className="mb-6"
        description="Opdater organisationens navn og visuelle grundindstillinger."
        eyebrow="Organisation"
        title="Rediger organisation"
      />
      <div className="max-w-3xl border-y border-line py-5">
        <ResourceForm
          endpoint={`/api/organizations/${organizationId}`}
          fields={[
            {
              name: "name",
              label: "Organisationsnavn",
              required: true,
              requiredMessage: "Organisationsnavn skal udfyldes",
              defaultValue: context.organization.name,
            },
          ]}
          method="PATCH"
          successPath={`/organizations/${organizationId}`}
          submitLabel="Gem organisation"
        />
      </div>
      <div className="mt-8">
        <OrganizationBrandingForm
          branding={branding}
          organizationId={organizationId}
          organizationName={context.organization.name}
        />
      </div>
    </div>
  );
}
