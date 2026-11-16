"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";

import { AppIcon } from "@/components/icons/app-icon";
import { Button, StatusBadge } from "@/components/ui";
import type { StatusTone } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/localization";

type Row = {
  id: string;
  title: string;
  href: string;
  detail?: string;
  date?: string;
};

export function OverviewList({
  rows,
  empty,
  status,
}: {
  rows: Row[];
  empty: string;
  status?: { label: string; tone: StatusTone };
}) {
  const [limit, setLimit] = useState(5);
  if (!rows.length) return <p className="py-2 text-sm text-muted">{empty}</p>;

  return (
    <>
      <ul className="divide-y divide-line">
        {rows.slice(0, limit).map((row) => (
          <li key={row.id}>
            <Link
              href={row.href}
              className={clsx(
                "flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:bg-subtle",
                status &&
                  "rounded-md focus-visible:outline-2 focus-visible:outline-brand",
              )}
            >
              <span
                className={clsx(
                  "flex min-w-0 flex-1 items-center justify-between gap-3",
                  status && "max-sm:flex-col max-sm:items-start max-sm:gap-0.5",
                )}
              >
                <span className="min-w-0">
                  <span className="block break-words font-semibold text-brand">
                    {row.title}
                  </span>
                  {row.detail ? (
                    <span className="block break-words text-xs text-muted">
                      {row.detail}
                    </span>
                  ) : null}
                </span>
                {row.date ? (
                  <time
                    dateTime={row.date}
                    className="shrink-0 text-xs text-muted sm:text-right"
                  >
                    {formatDateTime(row.date)}
                  </time>
                ) : null}
              </span>
              {status ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  <AppIcon name="arrowRight" size={14} className="text-brand" />
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {rows.length > limit ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setLimit(limit + 5)}
        >
          Vis flere
        </Button>
      ) : null}
    </>
  );
}
