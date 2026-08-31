"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppIcon } from "@/components/icons/app-icon";
import { Dropdown } from "@/components/ui/dropdown";
import { organizationRoleLabels } from "@/lib/localization";
import type { OrganizationMember } from "@/types/domain";

function initials(name: string) {
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

export function OrganizationSwitcher({
  organizations,
}: {
  organizations: Array<{
    id: string;
    name: string;
    role: OrganizationMember["role"];
  }>;
}) {
  const pathname = usePathname();
  const activeOrganizationId =
    pathname.match(/^\/organizations\/([^/]+)/)?.[1] ?? null;
  const activeOrganization = organizations.find(
    (organization) => organization.id === activeOrganizationId,
  );

  return (
    <Dropdown
      className="app-header-dropdown app-header-organization-switcher"
      label={
        <>
          <AppIcon name="organization" size={17} />
          <span className="app-header-organization-name min-w-0 truncate">
            {activeOrganization?.name ?? "Vælg organisation"}
          </span>
          <span className="sr-only">Skift organisation</span>
        </>
      }
    >
      <div className="w-[min(20rem,calc(100vw-2rem))] min-w-0 space-y-1">
        {organizations.map((organization) => {
          const active = organization.id === activeOrganizationId;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={clsx(
                "grid min-h-11 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-sm transition hover:bg-subtle hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                active ? "bg-brand-soft text-brand" : "text-ink",
              )}
              href={`/organizations/${organization.id}`}
              key={organization.id}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] bg-brand-soft text-[0.65rem] font-bold text-brand">
                {initials(organization.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {organization.name}
                </span>
                <span className="block truncate text-xs font-medium text-muted">
                  {organizationRoleLabels[organization.role]}
                </span>
              </span>
              {active ? (
                <span className="text-xs font-semibold">Aktiv</span>
              ) : (
                <AppIcon name="arrowRight" size={15} />
              )}
            </Link>
          );
        })}
        <div className="mt-2 border-t border-line pt-2">
          <Link
            className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold text-brand transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            href="/organizations"
          >
            <AppIcon name="organization" size={16} />
            Alle organisationer
          </Link>
        </div>
      </div>
    </Dropdown>
  );
}
