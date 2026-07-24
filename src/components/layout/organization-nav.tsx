"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useDialogFocus } from "@/hooks/use-dialog-focus";
import {
  getActiveCommitteeId,
  isOrganizationNavItemActive,
  organizationNavItems,
} from "@/lib/organization-navigation";

export function OrganizationNav({
  canManageTrash = false,
  committees = [],
  organizationId,
  organizationName,
}: {
  logoUrl?: string | null;
  canManageTrash?: boolean;
  committees?: Array<{ id: string; name: string }>;
  organizationId: string;
  organizationName?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const root = `/organizations/${organizationId}`;
  const items = useMemo(
    () =>
      organizationNavItems.filter(
        (item) => item.suffix !== "/trash" || canManageTrash,
      ),
    [canManageTrash],
  );
  const activeItem =
    items.find((item) => isOrganizationNavItemActive(pathname, root, item)) ??
    items[0];
  const activeCommitteeId = getActiveCommitteeId(pathname, root);
  const activeCommittee = committees.find(
    (committee) => committee.id === activeCommitteeId,
  );
  useDialogFocus({
    active: mobileOpen,
    containerRef: drawerRef,
    onEscape: () => setMobileOpen(false),
    returnFocusRef: triggerRef,
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const desktopMedia = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false);
    };
    desktopMedia.addEventListener("change", closeOnDesktop);
    return () => desktopMedia.removeEventListener("change", closeOnDesktop);
  }, []);

  const navLinks = (onNavigate?: () => void) => (
    <div className="org-nav-list">
      {items.map((item) => {
        const href = `${root}${item.suffix}`;
        const active = isOrganizationNavItemActive(pathname, root, item);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={clsx("org-nav-link", active && "org-nav-link-active")}
            href={href}
            key={item.label}
            onClick={onNavigate}
          >
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <aside className="org-sidebar">
      <div className="org-mobile-context">
        <div className="min-w-0">
          <p className="org-mobile-organization truncate">
            {organizationName ?? "Organisation"}
          </p>
          <p className="org-mobile-location truncate">
            {activeCommittee ? `${activeCommittee.name} · ` : ""}
            {activeItem.label}
          </p>
        </div>
        <button
          aria-controls="organization-mobile-navigation"
          aria-expanded={mobileOpen}
          aria-haspopup="dialog"
          className="org-mobile-menu-trigger"
          onClick={() => setMobileOpen(true)}
          ref={triggerRef}
          type="button"
        >
          Menu
          <span aria-hidden>☰</span>
        </button>
      </div>

      <nav
        aria-label="Organisationsnavigation"
        className="org-desktop-navigation"
      >
        <div className="org-sidebar-header">
          <p className="org-sidebar-kicker text-[0.62rem] font-semibold uppercase tracking-[0.16em]">
            Organisation
          </p>
          <p className="org-sidebar-title mt-0.5 text-[0.82rem] font-semibold leading-5">
            {organizationName ?? "Organisation"}
          </p>
          <p className="org-sidebar-current mt-1.5 text-[0.72rem] font-medium">
            Aktuel side: <span>{activeItem.label}</span>
          </p>
        </div>
        {navLinks()}
      </nav>

      {mobileOpen ? (
        <div
          className="org-mobile-overlay"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setMobileOpen(false);
          }}
        >
          <div
            aria-labelledby={titleId}
            aria-modal="true"
            className="org-mobile-drawer"
            id="organization-mobile-navigation"
            ref={drawerRef}
            role="dialog"
          >
            <div className="org-mobile-drawer-header">
              <div className="min-w-0">
                <p className="org-sidebar-kicker text-xs font-semibold uppercase tracking-[0.14em]">
                  Organisation
                </p>
                <h2
                  className="org-sidebar-title mt-1 truncate text-base font-semibold"
                  id={titleId}
                >
                  {organizationName ?? "Organisation"}
                </h2>
                <p className="org-sidebar-current mt-1 text-sm">
                  {activeCommittee ? `${activeCommittee.name} · ` : ""}
                  <span>{activeItem.label}</span>
                </p>
              </div>
              <button
                aria-label="Luk navigation"
                className="org-mobile-close"
                onClick={() => setMobileOpen(false)}
                type="button"
              >
                Luk
              </button>
            </div>
            <nav aria-label="Mobil organisationsnavigation">
              {navLinks(() => setMobileOpen(false))}
            </nav>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
