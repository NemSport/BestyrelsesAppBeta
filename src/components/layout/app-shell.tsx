import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Dropdown } from "@/components/ui/dropdown";

export function AppShell({
  children,
  userLabel,
}: {
  children: React.ReactNode;
  userLabel: string;
}) {
  return (
    <div className="app-frame min-h-screen overflow-x-clip">
      <header className="app-header sticky top-0 z-40">
        <div className="mx-auto flex max-w-[88rem] items-center justify-between gap-3 px-[var(--space-page-x)] py-3">
          <Link
            className="group inline-flex min-w-0 items-center gap-3 tracking-[-0.01em]"
            href="/organizations"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] bg-brand text-xs font-bold text-white shadow-sm">
              U
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink sm:text-base">
                Udvalgshukommelsen
              </span>
              <span className="hidden truncate text-xs font-medium text-muted sm:block">
                Bestyrelsens hukommelse og handlinger
              </span>
            </span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <div className="shrink-0" id="app-header-quick-action" />
            <Link
              className="hidden rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold text-muted transition hover:bg-subtle hover:text-ink sm:inline-flex"
              href="/organizations"
            >
              Organisationer
            </Link>
            <Dropdown label={userLabel}>
              <SignOutButton className="w-full rounded-lg px-3 py-2 text-left hover:bg-subtle" />
            </Dropdown>
          </div>
        </div>
      </header>
      <main className="page-shell">{children}</main>
    </div>
  );
}
