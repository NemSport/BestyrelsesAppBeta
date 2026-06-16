import { notFound } from "next/navigation";

import { ResourceForm } from "@/components/forms/resource-form";
import { OrganizationNav } from "@/components/layout/organization-nav";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";

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

  return (
    <div>
      <OrganizationNav organizationId={organizationId} />
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Rediger organisation</h1>
        <p className="mt-2 text-sm text-slate-600">Opdater organisationens navn.</p>
        <div className="panel mt-6 p-6">
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
      </div>
    </div>
  );
}
