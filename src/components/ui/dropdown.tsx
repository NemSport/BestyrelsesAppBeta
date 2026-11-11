"use client";

import { useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { buttonClassName } from "./button";

import { AppIcon } from "@/components/icons/app-icon";
import { useDismissibleDetails } from "@/hooks/use-dismissible-details";

export function Dropdown({
  label,
  children,
  align = "right",
  className,
  hideChevron = false,
  onOpenChange,
  open: controlledOpen,
  panelId,
  quiet = true,
}: {
  label: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
  hideChevron?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  panelId?: string;
  quiet?: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  useDismissibleDetails(detailsRef);

  return (
    <details
      className={clsx("group relative", className)}
      onToggle={(event) => {
        setInternalOpen(event.currentTarget.open);
        onOpenChange?.(event.currentTarget.open);
      }}
      open={controlledOpen}
      ref={detailsRef}
    >
      <summary
        aria-controls={panelId}
        aria-expanded={open}
        className={clsx(
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
          quiet
            ? buttonClassName({ variant: "quiet" })
            : "flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-muted transition hover:bg-subtle hover:text-ink",
        )}
      >
        {label}
        {hideChevron ? null : (
          <AppIcon
            className="transition group-open:rotate-180"
            name="chevronDown"
            size={15}
          />
        )}
      </summary>
      <div
        className={clsx(
          "dropdown-panel absolute z-[70] mt-2 min-w-48 rounded-[var(--radius-panel)] border border-line bg-surface p-2 text-ink shadow-dialog",
          align === "right" ? "right-0" : "left-0",
        )}
        id={panelId}
      >
        {children}
      </div>
    </details>
  );
}
