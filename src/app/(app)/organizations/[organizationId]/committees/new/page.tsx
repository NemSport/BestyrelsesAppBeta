import Link from "next/link";
import { notFound } from "next/navigation";

import { ResourceForm } from "@/components/forms/resource-form";
import { PageHeader, buttonClassName } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";

export default async function NewCommitteePage({
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
    <div className="max-w-3xl">
      <PageHeader
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href={`/organizations/${organizationId}/committees`}
          >
            Annuller
          </Link>
        }
        className="mb-6"
        description="Opret et arbejdsrum til organisationens møder, dagsordenspunkter og opfølgning."
        eyebrow="Udvalg"
        title="Nyt udvalg"
      />
      <div className="border-y border-line py-5">
        <ResourceForm
          endpoint={`/api/organizations/${organizationId}/committees`}
          fields={[
            {
              name: "name",
              label: "Udvalgsnavn",
              required: true,
              requiredMessage: "Udvalgsnavn skal udfyldes",
            },
            {
              name: "description",
              label: "Beskrivelse",
              type: "textarea",
              helpText: "Valgfrit. Beskriv kort udvalgets formål og ansvarsområde.",
            },
          ]}
          submitLabel="Opret udvalg"
          successPath={`/organizations/${organizationId}/committees/:id`}
        />
      </div>
    </div>
  );
}
