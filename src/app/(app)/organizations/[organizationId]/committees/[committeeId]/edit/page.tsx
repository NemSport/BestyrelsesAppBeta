import { notFound } from "next/navigation";

import { ResourceForm } from "@/components/forms/resource-form";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";

export default async function EditCommitteePage({
  params,
}: {
  params: Promise<{ organizationId: string; committeeId: string }>;
}) {
  const { organizationId, committeeId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const organizationContext = await new AuthorizationService(db)
    .requireOrganizationAdmin(organizationId, user.id)
    .catch(() => null);
  if (!organizationContext) notFound();
  const context = await new AuthorizationService(db)
    .requireCommitteeMember(organizationId, committeeId, user.id)
    .catch(() => null);
  if (!context) notFound();
  const root = `/organizations/${organizationId}/committees/${committeeId}`;

  return (
    <div className="max-w-3xl">
      <PageHeader
        className="mb-6"
        description="Opdater udvalgets navn og beskrivelse."
        eyebrow="Udvalg"
        title="Rediger udvalg"
      />
      <div className="border-y border-line py-5">
        <ResourceForm
          endpoint={`/api/committees/${committeeId}`}
          fields={[
            {
              name: "name",
              label: "Udvalgsnavn",
              required: true,
              requiredMessage: "Udvalgsnavn skal udfyldes",
              defaultValue: context.committee.name,
            },
            {
              name: "description",
              label: "Beskrivelse",
              type: "textarea",
              defaultValue: context.committee.description,
            },
          ]}
          hidden={{ organizationId }}
          method="PATCH"
          successPath={root}
          submitLabel="Gem udvalg"
        />
      </div>
    </div>
  );
}
