"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AppIcon } from "@/components/icons/app-icon";
import { withMeetingReturnTo } from "@/lib/meeting-navigation";
import type { OrganizationOverview } from "@/types/domain";

export function OrganizationDashboardPriority({
  actionSection,
  actionCount,
  messageCount,
  messageSection,
  organizationId,
  nextMeeting,
  recentMinutesSection,
}: {
  actionSection: ReactNode;
  actionCount: number;
  messageCount: number;
  messageSection: ReactNode;
  organizationId: string;
  nextMeeting: Pick<
    OrganizationOverview["upcomingMeetings"][number],
    "id" | "committee_id" | "starts_at" | "title" | "committeeName"
  > | null;
  recentMinutesSection: ReactNode;
}) {
  const root = `/organizations/${organizationId}`;
  const [view, setView] = useState<"actions" | "messages" | "news">("actions");

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <section
        className="min-w-0 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface text-ink shadow-sm"
        aria-label="Fokus"
      >
        <div className="flex flex-wrap items-center gap-1 border-b border-line bg-surface p-2">
          {(
            [
              ["actions", `Handlinger · ${actionCount}`],
              ["messages", `Beskeder · ${messageCount}`],
              ["news", "Seneste nyt"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${view === id ? "bg-brand-soft text-brand" : "text-muted hover:bg-subtle"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "actions" ? (
          <div className="p-3 sm:p-4" id="handlinger">
            {actionSection}
          </div>
        ) : (
          <div className="p-3 text-ink sm:p-4">
            {view === "messages" ? messageSection : recentMinutesSection}
          </div>
        )}
      </section>
      <aside
        className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface p-4 text-ink shadow-sm"
        aria-label="Næste møde"
      >
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand">
          <AppIcon name="calendar" size={16} /> Næste møde
        </div>
        {nextMeeting ? (
          <>
            <time
              dateTime={nextMeeting.starts_at}
              className="mt-3 block tabular-nums text-lg text-brand"
            >
              {new Intl.DateTimeFormat("da-DK", {
                timeZone: "Europe/Copenhagen",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(nextMeeting.starts_at))}
            </time>
            <h2 className="mt-2 break-words text-2xl font-semibold tracking-tight">
              {nextMeeting.title}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {nextMeeting.committeeName}
            </p>
            <Link
              className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-line-strong px-3 text-sm font-semibold text-brand hover:bg-brand-soft"
              href={withMeetingReturnTo(
                `${root}/committees/${nextMeeting.committee_id}/meetings/${nextMeeting.id}?view=preparation`,
                root,
              )}
            >
              Mødeforberedelse →
            </Link>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted">Ingen kommende møder</p>
        )}
        <Link
          className="mt-4 block w-fit text-sm text-muted hover:underline"
          href="#maanedskalender"
        >
          Åbn kalender →
        </Link>
      </aside>
    </div>
  );
}
