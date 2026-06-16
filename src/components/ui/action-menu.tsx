"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

export function ActionMenu({
  children,
  label = "Flere handlinger",
  align = "right",
  className,
}: {
  children: ReactNode;
  label?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <details className={clsx("group relative", className)}>
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center justify-center rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:border-accent/55 hover:bg-mist/65 [&::-webkit-details-marker]:hidden">
        {label}
        <span className="ml-1.5 text-[0.65rem] text-muted transition group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div
        className={clsx(
          "absolute z-40 mt-2 min-w-56 space-y-1 border border-line bg-surface p-2 shadow-dialog",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        {children}
      </div>
    </details>
  );
}
