import clsx from "clsx";

export function interactiveSurfaceClassName(className?: string) {
  return clsx(
    "group block cursor-pointer touch-manipulation rounded-[var(--radius-panel)] border border-line-strong bg-surface shadow-sm",
    "transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-brand/55 hover:shadow-[var(--shadow-panel)] active:translate-y-0 active:shadow-sm",
    className,
  );
}

export function staticSurfaceClassName(className?: string) {
  return clsx(
    "rounded-[var(--radius-panel)] border border-line bg-surface/90",
    className,
  );
}

export function primarySurfaceLinkClassName(className?: string) {
  return clsx(
    "inline-flex min-h-11 touch-manipulation items-center gap-2 font-semibold text-ink underline decoration-brand/45 decoration-2 underline-offset-4",
    "transition hover:text-brand hover:decoration-brand active:translate-y-px",
    "after:text-brand after:content-['→']",
    className,
  );
}

export function SurfaceLinkCue({ label = "Åbn" }: { label?: string }) {
  return (
    <span
      aria-hidden="true"
      className="mt-4 inline-flex min-h-11 items-center gap-2 border-t border-line pt-3 text-sm font-semibold text-brand"
    >
      {label}
      <span className="transition-transform group-hover:translate-x-1">→</span>
    </span>
  );
}
