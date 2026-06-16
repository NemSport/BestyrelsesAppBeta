import type { HTMLAttributes } from "react";
import clsx from "clsx";

export function ContentPanel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("panel p-5 sm:p-6", className)} {...props} />;
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
        "action-row border-t border-line pt-5",
        className,
      )}
      {...props}
    />
  );
}

export function FilterBar({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("filter-surface", className)} {...props} />;
}

export function MetadataRow({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("metadata-row", className)} {...props} />;
}
