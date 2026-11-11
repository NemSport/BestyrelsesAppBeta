import type { ComponentPropsWithRef } from "react";
import clsx from "clsx";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "quiet"
  | "menu";
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
    "ui-action",
    size === "sm" || variant === "quiet" ? "text-xs" : "text-sm",
    variant === "primary" && "ui-action-primary",
    variant === "danger" && "ui-action-danger",
    variant === "menu" && "ui-action-menu",
    className,
  );
}

export function Button({
  className,
  size,
  variant,
  type = "button",
  ...props
}: ComponentPropsWithRef<"button"> & {
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
