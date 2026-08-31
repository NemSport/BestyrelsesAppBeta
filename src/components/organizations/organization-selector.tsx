"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { ResourceForm } from "@/components/forms/resource-form";
import { AppIcon } from "@/components/icons/app-icon";
import {
  Button,
  EmptyState,
  Modal,
  PageHeader,
  interactiveSurfaceClassName,
} from "@/components/ui";
import { organizationRoleLabels } from "@/lib/localization";
import type { OrganizationWorkspaceEntry } from "@/types/domain";

function organizationInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "OR"
  );
}

function committeeLabel(count: number) {
  return count === 1 ? "1 udvalg" : `${count} udvalg`;
}

export function OrganizationSelector({
  organizations,
}: {
  organizations: OrganizationWorkspaceEntry[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="page-flow" data-organization-selector>
      <PageHeader
        actions={
          <Button
            className="w-full sm:w-auto"
            onClick={() => setCreateOpen(true)}
            variant="secondary"
          >
            <span aria-hidden="true">+</span>
            Opret organisation
          </Button>
        }
        description="Fortsæt til det arbejdsrum, du vil arbejde i."
        eyebrow="Organisationer"
        title="Vælg organisation"
      />

      {organizations.length > 0 ? (
        <section aria-label="Dine organisationer">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {organizations.map((organization) => (
              <Link
                aria-label={`Åbn arbejdsrummet ${organization.name}`}
                className={interactiveSurfaceClassName(
                  "relative grid min-h-32 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 overflow-hidden p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:p-5",
                )}
                href={`/organizations/${organization.id}`}
                key={organization.id}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-1 bg-brand/75"
                />
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-control)] border border-brand/15 bg-brand-soft text-sm font-bold text-brand sm:size-14">
                  {organization.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      className="h-full w-full object-contain p-1.5"
                      src={organization.logoUrl}
                    />
                  ) : (
                    organizationInitials(organization.name)
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block break-words text-base font-semibold leading-6 text-ink group-hover:text-brand sm:text-lg">
                    {organization.name}
                  </span>
                  <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted sm:text-sm">
                    <span className="rounded-full bg-subtle px-2 py-0.5 font-semibold text-ink">
                      {organizationRoleLabels[organization.role]}
                    </span>
                    <span>{committeeLabel(organization.committeeCount)}</span>
                  </span>
                </span>
                <span className="grid size-11 shrink-0 place-items-center rounded-full text-brand transition-transform group-hover:translate-x-0.5 group-hover:bg-brand-soft">
                  <AppIcon name="arrowRight" size={19} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          action={
            <Button onClick={() => setCreateOpen(true)}>
              Opret organisation
            </Button>
          }
          description="Opret et arbejdsrum, og tilføj udvalg, møder og medlemmer, når du er klar."
          title="Du har endnu ingen organisationer."
        />
      )}

      <Modal
        description="Giv arbejdsrummet et navn. Du kan tilføje udvalg bagefter."
        initialFocusRef={nameInputRef}
        maxWidth="lg"
        onClose={() => setCreateOpen(false)}
        open={createOpen}
        title="Opret organisation"
      >
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
          initialFocusRef={nameInputRef}
          secondaryAction={{
            label: "Annuller",
            onClick: () => setCreateOpen(false),
          }}
          submitLabel="Opret organisation"
          successPath="/organizations/:id"
        />
      </Modal>
    </div>
  );
}
