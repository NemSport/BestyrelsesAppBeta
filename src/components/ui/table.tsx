import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import clsx from "clsx";

export function TableContainer({
  className,
  "aria-label": ariaLabel = "Tabel med vandret rulning",
  tabIndex = 0,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-label={ariaLabel}
      className={clsx(
        "overflow-x-auto border-y border-line bg-surface",
        className,
      )}
      role="region"
      tabIndex={tabIndex}
      {...props}
    />
  );
}

export function Table({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={clsx("w-full min-w-full text-left text-sm", className)}
      {...props}
    />
  );
}

export function TableHead({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={clsx(
        "border-b border-line bg-subtle/80 text-xs uppercase tracking-wide text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function TableRow({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={clsx(
        "border-b border-line transition-colors last:border-b-0 hover:bg-subtle/45",
        className,
      )}
      {...props}
    />
  );
}

export function TableHeaderCell({
  className,
  scope = "col",
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={clsx(
        "whitespace-nowrap px-4 py-3 font-semibold sm:px-5",
        className,
      )}
      scope={scope}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={clsx("px-4 py-3.5 align-middle sm:px-5 sm:py-4", className)}
      {...props}
    />
  );
}
