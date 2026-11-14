"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { AppIcon } from "@/components/icons/app-icon";
import { StatusBadge } from "@/components/ui";
import type { BestieThread } from "@/lib/bestie";

const actionWidth = 76;

export function BestieInboxRow({
  thread,
  href,
  current,
  revealed,
  busy,
  onReveal,
  onDelete,
}: {
  thread: BestieThread;
  href: string;
  current: boolean;
  revealed: boolean;
  busy: boolean;
  onReveal: (open: boolean) => void;
  onDelete: () => void;
}) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const preventClick = useRef(false);
  const [offset, setOffset] = useState<number | null>(null);
  const position = offset ?? (revealed ? -actionWidth : 0);

  return (
    <li
      className="relative overflow-hidden touch-pan-y"
      onPointerDown={(event) => {
        if (event.pointerType !== "touch" || !event.isPrimary) return;
        start.current = {
          x: event.clientX,
          y: event.clientY,
          id: event.pointerId,
        };
        preventClick.current = false;
      }}
      onPointerMove={(event) => {
        const origin = start.current;
        if (!origin || event.pointerId !== origin.id) return;
        const dx = event.clientX - origin.x;
        const dy = event.clientY - origin.y;
        if (!preventClick.current) {
          if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
            start.current = null;
            return;
          }
          if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy)) return;
          preventClick.current = true;
        }
        setOffset(
          Math.max(
            -actionWidth,
            Math.min(0, (revealed ? -actionWidth : 0) + dx),
          ),
        );
      }}
      onPointerUp={(event) => {
        const origin = start.current;
        start.current = null;
        setOffset(null);
        if (origin && preventClick.current) {
          const distance = event.clientX - origin.x;
          onReveal(revealed ? distance < 30 : distance < -36);
        }
      }}
      onPointerCancel={() => {
        start.current = null;
        setOffset(null);
      }}
    >
      <div
        className={`relative z-10 flex items-start ${current ? "bg-brand-soft" : "bg-surface"} ${offset === null ? "transition-transform motion-reduce:transition-none" : ""}`}
        style={{ transform: `translateX(${position}px)` }}
      >
        <Link
          aria-current={current ? "page" : undefined}
          className="block min-w-0 flex-1 break-words py-3 pl-4 hover:underline"
          href={href}
          onClick={(event) => {
            if (!preventClick.current && !revealed) return;
            event.preventDefault();
            if (!preventClick.current) onReveal(false);
            preventClick.current = false;
          }}
        >
          <span className="block font-semibold">{thread.title}</span>
          {thread.unread ? (
            <StatusBadge tone="info">Ny besked</StatusBadge>
          ) : null}
          <span className="mt-1 block line-clamp-2 text-sm text-muted">
            {thread.messages.at(-1)?.body}
          </span>
        </Link>
        <button
          className="m-1 grid size-11 shrink-0 place-content-center rounded-lg text-muted hover:bg-subtle"
          aria-label={`Flere muligheder for ${thread.title}`}
          aria-expanded={revealed}
          type="button"
          onClick={() => {
            if (!preventClick.current) onReveal(!revealed);
            preventClick.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onReveal(false);
          }}
        >
          <AppIcon name="more" size={18} />
        </button>
      </div>
      {revealed || position < 0 ? (
        <button
          className="absolute inset-y-0 right-0 grid w-[76px] place-content-center bg-red-700 text-sm font-semibold text-white hover:bg-red-800"
          tabIndex={revealed ? 0 : -1}
          type="button"
          disabled={busy || !revealed}
          onClick={onDelete}
        >
          Slet
        </button>
      ) : null}
    </li>
  );
}
