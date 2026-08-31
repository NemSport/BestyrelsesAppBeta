import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { OrganizationSwitcher } from "@/components/layout/organization-switcher";
import { GlobalSearch } from "@/components/search/global-search";
import { Dropdown } from "@/components/ui/dropdown";
import type { OrganizationMember } from "@/types/domain";

export function AppShell({
  children,
  organizations,
  userLabel,
}: {
  children: React.ReactNode;
  organizations: Array<{
    id: string;
    name: string;
    role: OrganizationMember["role"];
  }>;
  userLabel: string;
}) {
  const initials = userLabel
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="app-frame min-h-screen overflow-x-clip">
      <header className="app-header sticky top-0 z-40" id="app-header">
        <div className="app-header-inner mx-auto flex max-w-[96rem] items-center gap-3 px-[var(--space-page-x)]">
          <Link
            className="app-header-brand group inline-flex min-w-0 shrink-0 items-center gap-2.5 tracking-[-0.01em]"
            href="/organizations"
          >
            <span className="app-header-logo grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] text-xs font-bold">
              U
            </span>
            <span className="min-w-0">
              <span className="app-header-title block truncate text-sm font-semibold sm:text-base">
                BestyrelsesApp
              </span>
              <span className="app-header-subtitle hidden truncate text-xs font-medium xl:block">
                Hold overblik over bestyrelsesarbejdet
              </span>
            </span>
          </Link>
          <div
            aria-hidden="true"
            className="app-header-search-reserve min-w-0 flex-1"
          />
          <div className="app-header-controls flex min-w-0 shrink items-center gap-1.5">
            <GlobalSearch />
            <div className="shrink-0" id="app-header-quick-action" />
            <OrganizationSwitcher organizations={organizations} />
            <Dropdown
              className="app-header-dropdown"
              label={
                <>
                  <span
                    aria-hidden="true"
                    className="app-header-avatar grid size-7 shrink-0 place-items-center rounded-full text-[0.65rem] font-bold"
                  >
                    {initials || "M"}
                  </span>
                  <span className="app-header-user-name max-w-44 truncate">
                    {userLabel}
                  </span>
                  <span className="sr-only">Brugermenu for {userLabel}</span>
                </>
              }
            >
              <SignOutButton className="w-full rounded-lg px-3 py-2 text-left hover:bg-subtle" />
            </Dropdown>
          </div>
        </div>
      </header>
      <main className="page-shell">{children}</main>
    </div>
  );
}
