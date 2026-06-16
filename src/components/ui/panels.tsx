import type { HTMLAttributes } from "react";
import clsx from "clsx";

export function ContentPanel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("panel", className)} {...props} />;
}

export function DocumentPanel({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <article className={clsx("document-surface", className)} {...props} />
  );
}

export function ActionBar({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5",
        className,
      )}
      {...props}
    />
  );
}
