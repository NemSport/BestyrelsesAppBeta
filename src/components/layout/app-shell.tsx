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
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-[var(--space-page-x)] py-3.5">
          <Link
            className="text-sm font-semibold tracking-[-0.01em] text-brand sm:text-base"
            href="/organizations"
          >
            Udvalgshukommelsen
          </Link>
          <Dropdown label={userLabel}>
            <SignOutButton className="w-full rounded-lg px-3 py-2 text-left hover:bg-subtle" />
          </Dropdown>
        </div>
      </header>
      <main className="page-shell">{children}</main>
    </div>
  );
}
