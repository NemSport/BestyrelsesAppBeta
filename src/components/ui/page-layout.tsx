import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={clsx(
        "flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-lead">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function PageSection({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  ...props
}: HTMLAttributes<HTMLElement> & {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <section className={className} {...props}>
      {eyebrow || title || description || actions ? (
        <div className="action-row">
          <div className="min-w-0">
            {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
            {title ? <h2 className="section-title mt-1">{title}</h2> : null}
            {description ? (
              <p className="metadata mt-1 max-w-3xl">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        className={clsx(
          eyebrow || title || description || actions ? "mt-5" : undefined,
          contentClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
