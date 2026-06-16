"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "Overblik", suffix: "" },
  { label: "Møder", suffix: "/meetings" },
  { label: "Beslutninger", suffix: "/decisions" },
  { label: "Opgaver", match: "exact", suffix: "/tasks" },
  { label: "Mine opgaver", suffix: "/tasks/my" },
  { label: "Årshjul", suffix: "/annual-wheel" },
  { label: "Jobkort", suffix: "/job-cards" },
  { label: "Medlemmer", suffix: "/members" },
  { label: "Papirkurv", suffix: "/trash" },
] as const;

export function OrganizationNav({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName?: string;
}) {
  const pathname = usePathname();
  const root = `/organizations/${organizationId}`;

  const isActive = (item: (typeof items)[number]) => {
    const suffix = item.suffix;
    const href = `${root}${suffix}`;
    if (suffix === "") return pathname === root;
    if (item.label === "Møder") {
      return (
        pathname === href ||
        pathname.startsWith(`${href}/`) ||
        (pathname.startsWith(`${root}/committees/`) &&
          pathname.includes("/meetings"))
      );
    }
    if (item.label === "Årshjul") {
      return (
        pathname === href ||
        pathname.startsWith(`${href}/`) ||
        (pathname.startsWith(`${root}/committees/`) &&
          pathname.includes("/annual-wheel"))
      );
    }
    if ("match" in item && item.match === "exact") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const activeItem = items.find((item) => isActive(item)) ?? items[0];

  return (
    <aside className="org-sidebar">
      <nav aria-label="Organisationsnavigation">
        <div className="org-sidebar-header">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">
            Organisation
          </p>
          <p className="mt-0.5 text-[0.82rem] font-semibold leading-5 text-ink">
            {organizationName ?? "Organisation"}
          </p>
          <p className="mt-1.5 text-[0.72rem] font-medium text-muted">
            Aktuel side: <span className="text-ink">{activeItem.label}</span>
          </p>
        </div>
        <div className="org-nav-list">
          {items.map((item) => {
            const href = `${root}${item.suffix}`;
            const active = isActive(item);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={clsx("org-nav-link", active && "org-nav-link-active")}
                href={href}
                key={item.label}
              >
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
