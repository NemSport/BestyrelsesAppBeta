import type { ReactNode } from "react";
import clsx from "clsx";

export function EmptyState({
  title,
  description,
  action,
  compact = false,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface/72 text-center shadow-sm",
        compact ? "px-4 py-5" : "px-6 py-10",
        className,
      )}
    >
      <p className="text-base font-semibold text-ink">{title}</p>
      {description ? (
        <p className="metadata mx-auto mt-1 max-w-xl">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
