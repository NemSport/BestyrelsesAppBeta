import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

export function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return clsx(
    "inline-flex items-center justify-center font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
    size === "sm"
      ? "min-h-9 rounded-[var(--radius-control)] px-3 py-2 text-sm"
      : "min-h-[2.625rem] rounded-[var(--radius-control)] px-4 py-2.5 text-sm",
    variant === "primary" &&
      "bg-brand text-white shadow-sm hover:bg-brand-hover",
    variant === "secondary" &&
      "border border-line-strong bg-surface text-ink hover:border-accent/55 hover:bg-mist/65",
    variant === "danger" &&
      "border border-danger/25 bg-surface text-danger hover:bg-danger-soft",
    variant === "ghost" &&
      "bg-transparent text-muted hover:bg-subtle hover:text-ink",
    className,
  );
}

export function Button({
  className,
  size,
  variant,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  return (
    <button
      className={buttonClassName({ className, size, variant })}
      type={type}
      {...props}
    />
  );
}
