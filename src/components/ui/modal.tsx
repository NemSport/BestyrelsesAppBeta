"use client";

import {
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
  style,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: "lg" | "2xl" | "3xl";
  style?: CSSProperties;
}) {
  const titleId = useId();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

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

  if (!open || !portalTarget) return null;

  return createPortal(
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto overscroll-contain bg-ink/45 px-0 py-4 backdrop-blur-sm sm:px-6 sm:py-8"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
      style={{ ...style, fontFamily: "var(--font-sans)" }}
    >
      <div
        className={clsx(
          "flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-[var(--radius-dialog)] border border-line bg-surface shadow-dialog sm:max-h-[calc(100dvh-3rem)]",
          maxWidth === "lg" && "max-w-lg",
          maxWidth === "2xl" && "max-w-2xl",
          maxWidth === "3xl" && "max-w-3xl",
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface/95 p-5 backdrop-blur">
          <div className="min-w-0">
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
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-line bg-subtle/45 px-5 py-4 sm:px-7">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    portalTarget,
  );
}
