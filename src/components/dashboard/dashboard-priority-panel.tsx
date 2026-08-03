import type { ReactNode } from "react";

export function DashboardPriorityPanel({
  action,
  children,
  description,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section
      aria-labelledby="dashboard-priority-title"
      className="border-y border-brand/25 bg-brand-soft/35 px-3 py-4 sm:px-5 sm:py-5"
      data-dashboard-priority={eyebrow}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
            {eyebrow}
          </p>
          <h2
            className="mt-1 text-xl font-semibold"
            id="dashboard-priority-title"
          >
            {title}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
