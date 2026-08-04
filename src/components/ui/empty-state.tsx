import type { ReactNode } from "react";
import clsx from "clsx";

export function EmptyState({
  title,
  description,
  action,
  compact = false,
  kind = "empty",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  kind?: "empty" | "filtered" | "read-only" | "error";
  className?: string;
}) {
  return (
    <div
      aria-live={kind === "filtered" ? "polite" : undefined}
      className={clsx(
        "empty-state rounded-[var(--radius-panel)] border border-dashed text-center shadow-sm",
        kind === "empty" && "border-line-strong bg-surface/72",
        kind === "filtered" && "border-line-strong bg-subtle/45",
        kind === "read-only" && "border-line bg-subtle/45",
        kind === "error" && "border-danger/40 bg-danger/5",
        compact ? "px-4 py-5" : "px-6 py-10",
        className,
      )}
      data-empty-state={kind}
      role={
        kind === "error" ? "alert" : kind === "filtered" ? "status" : undefined
      }
    >
      <p className="text-base font-semibold text-ink">{title}</p>
      {description ? (
        <p className="metadata mx-auto mt-1 max-w-xl">{description}</p>
      ) : null}
      {action ? (
        <div className="action-cluster mt-4 justify-center">{action}</div>
      ) : null}
    </div>
  );
}
