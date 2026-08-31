"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

import { Button } from "@/components/ui/button";
import { useDialogFocus } from "@/hooks/use-dialog-focus";

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  initialFocusRef,
  maxWidth = "2xl",
  placement = "center",
  style,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  maxWidth?: "lg" | "2xl" | "3xl" | "6xl";
  placement?: "center" | "right";
  style?: CSSProperties;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useDialogFocus({
    active: open && Boolean(portalTarget),
    containerRef: dialogRef,
    initialFocusRef,
    onEscape: onClose,
  });

  if (!open || !portalTarget) return null;

  return createPortal(
    <div
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      aria-modal="true"
      className={clsx(
        "fixed inset-0 z-[1000] flex overflow-y-auto overscroll-contain bg-ink/45 backdrop-blur-sm",
        placement === "right"
          ? "items-stretch justify-end p-0"
          : "items-start justify-center px-0 py-4 sm:px-6 sm:py-8",
      )}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
      ref={dialogRef}
      tabIndex={-1}
      style={{ ...style, fontFamily: "var(--font-sans)" }}
    >
      <div
        className={clsx(
          "flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-[var(--radius-dialog)] border border-line bg-surface shadow-dialog sm:max-h-[calc(100dvh-3rem)]",
          placement === "right" &&
            "h-dvh !max-h-none !rounded-none border-y-0 border-r-0 sm:!max-h-none sm:!rounded-l-[var(--radius-dialog)]",
          maxWidth === "lg" && "max-w-lg",
          maxWidth === "2xl" && "max-w-2xl",
          maxWidth === "3xl" && "max-w-3xl",
          maxWidth === "6xl" && "max-w-6xl",
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface/95 p-5 backdrop-blur">
          <div className="min-w-0">
            {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
            <h2 className="section-title mt-1" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="metadata mt-1" id={descriptionId}>
                {description}
              </p>
            ) : null}
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
