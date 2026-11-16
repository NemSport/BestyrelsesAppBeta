"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { AppIcon, organizationNavIconNames } from "@/components/icons/app-icon";
import { Dropdown } from "@/components/ui/dropdown";
import {
  getVisibleOrganizationNavItems,
  isOrganizationNavItemActive,
  organizationNavTier,
} from "@/lib/organization-navigation";

export function OrganizationNav({
  canManageOrganization = false,
  organizationId,
}: {
  canManageOrganization?: boolean;
  organizationId: string;
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const panelId = useId();
  const root = `/organizations/${organizationId}`;
  const items = getVisibleOrganizationNavItems(canManageOrganization).map(
    (item) => ({
      ...item,
      tier: organizationNavTier(item.suffix),
      active: isOrganizationNavItemActive(pathname, root, item),
    }),
  );
  const active = items.find((item) => item.active);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    const app = navRef.current?.closest<HTMLElement>(".app-frame");
    if (!app) return;

    let compact = false;
    function update() {
      // Separate thresholds keep the header steady when its own height changes.
      const next = window.scrollY > (compact ? 24 : 72);
      if (next === compact) return;
      compact = next;
      app?.toggleAttribute("data-org-topbar-compact", compact);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      app.removeAttribute("data-org-topbar-compact");
    };
  }, []);

  return (
    <nav
      aria-label="Organisationsnavigation"
      className="org-topbar"
      ref={navRef}
    >
      <div className="org-topbar-inner">
        <div className="org-topbar-primary">
          {items
            .filter(({ tier }) => tier !== "overflow")
            .map((item) => (
              <Link
                aria-current={item.active ? "page" : undefined}
                className="org-nav-link"
                data-tier={item.tier}
                href={`${root}${item.suffix}`}
                key={item.suffix}
              >
                <span>{item.label}</span>
              </Link>
            ))}
        </div>
        <div className="org-topbar-more" data-active-tier={active?.tier}>
          <Dropdown
            className="org-topbar-dropdown"
            label={
              <>
                Mere
                {active ? (
                  <span className="org-topbar-current sr-only">
                    {" "}
                    · Aktuel side: {active.label}
                  </span>
                ) : null}
              </>
            }
            onOpenChange={setMoreOpen}
            open={moreOpen}
            panelId={panelId}
            quiet={false}
          >
            {items
              .filter(({ tier }) => tier !== "essential")
              .map((item) => (
                <Link
                  aria-current={item.active ? "page" : undefined}
                  className="org-nav-overflow-link"
                  data-tier={item.tier}
                  href={`${root}${item.suffix}`}
                  key={item.suffix}
                  onClick={() => setMoreOpen(false)}
                >
                  <AppIcon
                    name={organizationNavIconNames[item.suffix]}
                    size={16}
                  />
                  <span>{item.label}</span>
                </Link>
              ))}
          </Dropdown>
        </div>
      </div>
    </nav>
  );
}
