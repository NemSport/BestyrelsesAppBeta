import type { HTMLAttributes } from "react";
import clsx from "clsx";

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "progress";

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-subtle text-muted",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  progress: "bg-progress-soft text-progress",
};

export function StatusBadge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone }) {
  return (
    <span
      className={clsx(
        "inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
