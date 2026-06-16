"use client";

import { useEffect, useId, type ReactNode } from "react";
import clsx from "clsx";

import { Button } from "@/components/ui/button";

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  maxWidth = "2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: "lg" | "2xl" | "3xl";
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
    >
      <div
        className={clsx(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-[var(--radius-dialog)] bg-surface shadow-dialog sm:rounded-[var(--radius-dialog)]",
          maxWidth === "lg" && "max-w-lg",
          maxWidth === "2xl" && "max-w-2xl",
          maxWidth === "3xl" && "max-w-3xl",
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface/95 p-5 backdrop-blur">
          <div>
            {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
            <h2 className="section-title mt-1" id={titleId}>
              {title}
            </h2>
            {description ? <p className="metadata mt-1">{description}</p> : null}
          </div>
          <Button
            aria-label="Luk modal"
            onClick={onClose}
            size="sm"
            variant="secondary"
          >
            Luk
          </Button>
        </div>
        <div className="p-5 sm:p-7">{children}</div>
        {footer ? (
          <div className="border-t border-line px-5 py-4 sm:px-7">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
