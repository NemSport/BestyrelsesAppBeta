"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

export function Dropdown({
  label,
  children,
  align = "right",
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <details className={clsx("group relative", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-muted transition hover:bg-subtle hover:text-ink [&::-webkit-details-marker]:hidden">
        {label}
        <span className="text-xs transition group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div
        className={clsx(
          "absolute z-40 mt-2 min-w-48 rounded-[var(--radius-panel)] border border-line bg-surface p-2 shadow-dialog",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        {children}
      </div>
    </details>
  );
}
