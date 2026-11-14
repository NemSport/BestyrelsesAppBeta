"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui";
import { formatDateTime } from "@/lib/localization";

type Row = {
  id: string;
  title: string;
  href: string;
  detail?: string;
  date?: string;
};

export function OverviewList({ rows, empty }: { rows: Row[]; empty: string }) {
  const [limit, setLimit] = useState(5);
  if (!rows.length) return <p className="py-2 text-sm text-muted">{empty}</p>;

  return (
    <>
      <ul className="divide-y divide-line">
        {rows.slice(0, limit).map((row) => (
          <li key={row.id}>
            <Link
              href={row.href}
              className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:bg-subtle"
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
                  className="shrink-0 text-right text-xs text-muted"
                >
                  {formatDateTime(row.date)}
                </time>
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
