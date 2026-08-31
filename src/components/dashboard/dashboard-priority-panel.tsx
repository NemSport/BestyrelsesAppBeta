import type { ReactNode } from "react";
import clsx from "clsx";

export function DashboardPriorityPanel({
  action,
  children,
  description,
  eyebrow,
  title,
  className,
  variant = "band",
}: {
  action?: ReactNode;
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
  className?: string;
  variant?: "band" | "card";
}) {
  return (
    <section
      aria-labelledby="dashboard-priority-title"
      className={clsx(
        variant === "band"
          ? "border-y border-brand/25 bg-brand-soft/35 px-3 py-4 sm:px-5 sm:py-5"
          : "rounded-[var(--radius-panel)] border border-line bg-surface/90 px-3 py-2.5 shadow-sm sm:px-3.5 sm:py-3",
        className,
      )}
      data-dashboard-priority={eyebrow}
    >
      <div className="section-header flex-col lg:flex-row">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
            {eyebrow}
          </p>
          <h2
            className={clsx(
              "text-xl font-semibold",
              variant === "card" ? "mt-0.5" : "mt-1",
            )}
            id="dashboard-priority-title"
          >
            {title}
          </h2>
          <p
            className={clsx(
              "max-w-3xl text-sm text-muted",
              variant === "card" ? "mt-0.5 leading-5" : "mt-1",
            )}
          >
            {description}
          </p>
        </div>
        {action ? <div className="section-actions">{action}</div> : null}
      </div>
      <div className={variant === "card" ? "mt-2.5" : "mt-4"}>{children}</div>
    </section>
  );
}
