"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

export function ActionMenu({
  children,
  label = "Flere handlinger",
  ariaLabel,
  align = "right",
  className,
  showChevron = true,
  triggerClassName,
}: {
  children: ReactNode;
  label?: ReactNode;
  ariaLabel?: string;
  align?: "left" | "right";
  className?: string;
  showChevron?: boolean;
  triggerClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function close(returnFocus: boolean) {
      setOpen(false);
      if (returnFocus) triggerRef.current?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !containerRef.current?.contains(target)) {
        close(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <div
      className={clsx("group relative inline-block max-w-full", className)}
      onClick={(event) => event.stopPropagation()}
      ref={containerRef}
    >
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={ariaLabel}
        className={clsx(
          "inline-flex min-h-11 max-w-full cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:border-accent/55 hover:bg-mist/65",
          triggerClassName,
        )}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        {label}
        {showChevron ? (
          <span
            className={clsx(
              "ml-1.5 text-[0.65rem] text-muted transition",
              open && "rotate-180",
            )}
            aria-hidden
          >
            ▾
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className={clsx(
            "absolute z-[70] mt-2 w-max min-w-48 max-w-[calc(100vw-2rem)] space-y-1 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface p-2 shadow-dialog [&>a]:flex [&>a]:min-h-11 [&>a]:items-center [&>button]:min-h-11 sm:min-w-56",
            align === "right" ? "right-0" : "left-0",
          )}
          id={panelId}
          onClick={(event) => {
            const target = event.target;
            if (target instanceof Element && target.closest("a, button")) {
              setOpen(false);
            }
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
