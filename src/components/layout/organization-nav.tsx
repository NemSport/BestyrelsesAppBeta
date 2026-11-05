"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { AppIcon, organizationNavIconNames } from "@/components/icons/app-icon";
import {
  getActiveCommitteeId,
  isOrganizationNavItemActive,
  organizationNavItems,
} from "@/lib/organization-navigation";

const workOrder = [
  "",
  "/actions",
  "/meetings",
  "/decisions",
  "/tasks",
  "/documents",
  "/annual-wheel",
];
const organizationOrder = [
  "/committees",
  "/members",
  "/stakeholders",
  "/job-cards",
  "/trash",
];

export function OrganizationNav({
  canManageTrash = false,
  committees = [],
  organizationId,
  organizationName,
  activeActionCount = 0,
}: {
  logoUrl?: string | null;
  canManageTrash?: boolean;
  committees?: Array<{ id: string; name: string }>;
  organizationId: string;
  organizationName?: string;
  activeActionCount?: number;
}) {
  const pathname = usePathname();
  const navigationRef = useRef<HTMLElement>(null);
  const root = `/organizations/${organizationId}`;
  const items = organizationNavItems.filter(
    (item) => item.suffix !== "/trash" || canManageTrash,
  );
  const activeCommitteeId = getActiveCommitteeId(pathname, root);
  const activeCommittee = committees.find(
    (committee) => committee.id === activeCommitteeId,
  );

  // Use the real header height: text wrapping and browser zoom can change it.
  useEffect(() => {
    const header = document.getElementById("app-header");
    const navigation = navigationRef.current;
    if (!header || !navigation) return;
    const workspace = navigation.closest<HTMLElement>(".org-layout");
    const update = () => {
      const headerHeight = header.getBoundingClientRect().height;
      navigation.style.setProperty("--org-header-height", `${headerHeight}px`);
      workspace?.style.setProperty(
        "--org-content-top",
        `${headerHeight + navigation.getBoundingClientRect().height + 12}px`,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    observer.observe(navigation);
    return () => {
      observer.disconnect();
      workspace?.style.removeProperty("--org-content-top");
    };
  }, []);

  const navLinks = (order: string[], secondary = false) => (
    <div className="org-topnav-links">
      {order.flatMap((suffix) => {
        const item = items.find((candidate) => candidate.suffix === suffix);
        if (!item) return [];
        const active = isOrganizationNavItemActive(pathname, root, item);
        return [
          <Link
            aria-current={active ? "page" : undefined}
            className={clsx(
              "org-topnav-link",
              active && "org-topnav-link-active",
            )}
            href={`${root}${item.suffix}`}
            key={item.suffix}
          >
            {!secondary ? (
              <AppIcon name={organizationNavIconNames[item.suffix]} size={16} />
            ) : null}
            <span>{item.label}</span>
            {item.suffix === "/actions" && activeActionCount > 0 ? (
              <span
                aria-label={`${activeActionCount} aktive handlinger`}
                className="rounded-full bg-warning-soft px-1.5 text-xs text-ink"
              >
                {activeActionCount > 99 ? "99+" : activeActionCount}
              </span>
            ) : null}
          </Link>,
        ];
      })}
    </div>
  );

  return (
    <aside className="org-topnav" ref={navigationRef}>
      <nav aria-label="Arbejdsområder">{navLinks(workOrder)}</nav>
      <div className="org-topnav-secondary">
        <span className="org-topnav-label">Organisation</span>
        <nav aria-label="Organisationsnavigation">
          {navLinks(organizationOrder, true)}
        </nav>
        <span className="org-topnav-context">
          {organizationName ?? "Organisation"}
          {activeCommittee ? ` · ${activeCommittee.name}` : ""}
        </span>
      </div>
    </aside>
  );
}
