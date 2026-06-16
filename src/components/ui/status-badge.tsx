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
  neutral: "border-line bg-subtle text-muted",
  info: "border-info/15 bg-info-soft text-info",
  success: "border-success/15 bg-success-soft text-success",
  warning: "border-warning/20 bg-warning-soft text-warning",
  danger: "border-danger/20 bg-danger-soft text-danger",
  progress: "border-progress/20 bg-progress-soft text-progress",
};

export function StatusBadge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone }) {
  return (
    <span
      className={clsx(
        "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
