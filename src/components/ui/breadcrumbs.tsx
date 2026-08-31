import Link from "next/link";
import clsx from "clsx";

import { AppIcon } from "@/components/icons/app-icon";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({
  items,
  mobileBack,
  className,
}: {
  items: BreadcrumbItem[];
  mobileBack?: BreadcrumbItem;
  className?: string;
}) {
  const fallbackBack = [...items]
    .slice(0, -1)
    .reverse()
    .find((item) => item.href);
  const back = mobileBack ?? fallbackBack;

  return (
    <nav
      aria-label="Brødkrummer"
      className={clsx("min-w-0", className)}
    >
      {back?.href ? (
        <Link
          className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-[var(--radius-control)] pr-2 text-sm font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:hidden"
          href={back.href}
        >
          <AppIcon aria-hidden="true" name="arrowLeft" size={15} />
          <span className="truncate">Tilbage til {back.label.toLocaleLowerCase("da-DK")}</span>
        </Link>
      ) : null}
      <ol className="hidden min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted sm:flex">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li
              className="flex min-w-0 items-center gap-2"
              key={`${item.href ?? "current"}-${item.label}`}
            >
              {index > 0 ? (
                <span aria-hidden="true" className="text-line-strong">
                  /
                </span>
              ) : null}
              {item.href && !current ? (
                <Link
                  className="max-w-64 truncate rounded-sm font-medium hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  href={item.href}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={current ? "page" : undefined}
                  className="max-w-80 truncate font-semibold text-ink"
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
