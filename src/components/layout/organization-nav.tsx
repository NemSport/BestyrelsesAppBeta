"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useEffect, useState } from "react";

const items = [
  { label: "Overblik", suffix: "" },
  { label: "Møder", suffix: "#kommende-moeder" },
  { label: "Årshjul", suffix: "/annual-wheel" },
  { label: "Jobkort", suffix: "/job-cards" },
  { label: "Beslutninger", suffix: "/decisions" },
  { label: "Task View", suffix: "/tasks" },
  { label: "Mine opgaver", suffix: "/tasks/my" },
  { label: "Medlemmer", suffix: "/members" },
] as const;

export function OrganizationNav({
  organizationId,
}: {
  organizationId: string;
}) {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  const root = `/organizations/${organizationId}`;

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, [pathname]);

  return (
    <nav
      aria-label="Organisationsnavigation"
      className="sticky top-0 z-20 -mx-[var(--space-page-x)] mb-8 border-b border-line bg-background/95 px-[var(--space-page-x)] py-2 backdrop-blur"
    >
      <div className="flex gap-1 overflow-x-auto pb-1">
        {items.map((item) => {
          const href = `${root}${item.suffix}`;
          const active =
            item.suffix === ""
              ? pathname === root && !hash
              : item.suffix.startsWith("#")
                ? pathname === root && hash === item.suffix
                : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={clsx(
                "shrink-0 rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold transition",
                active
                  ? "bg-brand text-white shadow-sm"
                  : "text-muted hover:bg-subtle hover:text-ink",
              )}
              href={href}
              key={item.label}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
