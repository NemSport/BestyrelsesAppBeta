import type { ReactNode } from "react";
import clsx from "clsx";

type FeedbackTone = "neutral" | "success" | "warning" | "danger";

const toneClassName: Record<FeedbackTone, string> = {
  neutral: "border-line bg-subtle text-muted",
  success: "border-success/20 bg-success-soft text-success",
  warning: "border-warning/25 bg-warning-soft text-warning",
  danger: "border-danger/25 bg-danger-soft text-danger",
};

export function FeedbackState({
  tone = "neutral",
  title,
  description,
  action,
  className,
}: {
  tone?: FeedbackTone;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border px-4 py-3 text-sm",
        toneClassName[tone],
        className,
      )}
    >
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {description ? <p className="mt-1 opacity-85">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
