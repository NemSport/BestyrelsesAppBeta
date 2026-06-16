import Link from "next/link";

import { ResourceForm } from "@/components/forms/resource-form";
import {
  ContentPanel,
  EmptyState,
  PageHeader,
  PageSection,
} from "@/components/ui";
import { organizationRoleLabels } from "@/lib/localization";
import { createClient } from "@/lib/supabase/server";
import { OrganizationService } from "@/services/organization-service";

export default async function OrganizationsPage() {
  const db = await createClient();
  const memberships = await new OrganizationService(db).listForCurrentUser();

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <PageSection>
        <PageHeader
          description="Vælg det organisatoriske arbejdsrum, du vil fortsætte i."
          eyebrow="Organisationer"
          title="Vælg din organisation"
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {memberships.map((membership) => {
            const organization = membership.organizations;
            if (!organization) return null;
            return (
              <Link
                className="panel p-6 transition hover:border-accent"
                href={`/organizations/${organization.id}`}
                key={organization.id}
              >
                <h2 className="text-xl font-semibold">{organization.name}</h2>
                <p className="mt-2 text-sm capitalize text-muted">
                  {organizationRoleLabels[membership.role]}
                </p>
              </Link>
            );
          })}
          {memberships.length === 0 ? (
            <EmptyState
              className="md:col-span-2"
              description="Når organisationen er oprettet, kan du tilføje udvalg, møder og medlemmer."
              title="Opret din første organisation for at komme i gang."
            />
          ) : null}
        </div>
      </PageSection>
      <ContentPanel className="h-fit p-6">
        <h2 className="text-lg font-semibold">Ny organisation</h2>
        <p className="mt-2 text-sm text-muted">
          En organisation indeholder ét eller flere udvalg.
        </p>
        <div className="mt-6">
          <ResourceForm
            endpoint="/api/organizations"
            fields={[
              {
                name: "name",
                label: "Organisationsnavn",
                required: true,
                requiredMessage: "Organisationsnavn skal udfyldes",
              },
            ]}
            successPath="/organizations/:id"
            submitLabel="Opret organisation"
          />
        </div>
      </ContentPanel>
    </div>
  );
}
