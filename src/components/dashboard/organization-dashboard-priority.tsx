"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AppIcon } from "@/components/icons/app-icon";
import { StatusBadge } from "@/components/ui";
import type { OrganizationRole } from "@/lib/meeting-capabilities";
import type { ActionItem, OrganizationOverview } from "@/types/domain";

export function OrganizationDashboardPriority({
  actions,
  actionCount,
  committeeCount,
  committeeSection,
  organizationId,
  organizationRole,
  nextMeeting,
  recentMinutesSection,
}: {
  actions: Pick<
    ActionItem,
    "key" | "href" | "title" | "priority" | "description" | "context"
  >[];
  actionCount: number;
  committeeCount: number;
  committeeSection: ReactNode;
  organizationId: string;
  organizationRole: OrganizationRole;
  nextMeeting: Pick<
    OrganizationOverview["upcomingMeetings"][number],
    "id" | "committee_id" | "starts_at" | "title" | "committeeName"
  > | null;
  recentMinutesSection: ReactNode;
}) {
  const root = `/organizations/${organizationId}`;
  const [view, setView] = useState<"actions" | "news" | "committees">(
    "actions",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const action = actions.find(({ key }) => key === selected) ?? actions[0];

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
              ["news", "Seneste nyt"],
              ["committees", `Udvalg · ${committeeCount}`],
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
          <div className="bg-surface p-3 sm:p-4">
            {action ? (
              <>
                <div
                  className="mb-3 flex flex-wrap gap-2"
                  aria-label="Vælg handling"
                >
                  {actions.map((item, index) => (
                    <button
                      key={item.key}
                      type="button"
                      aria-label={item.title}
                      aria-pressed={item.key === action.key}
                      onClick={() => setSelected(item.key)}
                      className={`flex min-h-10 min-w-10 items-center justify-center rounded-lg border font-mono text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${item.key === action.key ? "border-brand bg-brand-soft text-brand" : "border-line-strong text-ink hover:bg-brand-soft"}`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </button>
                  ))}
                </div>
                <StatusBadge
                  tone={
                    action.priority === "critical"
                      ? "danger"
                      : action.priority === "soon"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {action.priority === "critical"
                    ? "Kræver handling"
                    : action.priority === "soon"
                      ? "Snart"
                      : "Opfølgning"}
                </StatusBadge>
                <h2 className="mt-3 max-w-xl break-words text-xl font-semibold leading-snug tracking-tight">
                  {action.title}
                </h2>
                <p className="mt-2 text-sm text-muted">
                  {action.description}{" "}
                  <span className="text-muted">{action.context}</span>
                </p>
                <Link
                  className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-bold text-white hover:bg-brand-hover"
                  href={`${root}${action.href}`}
                >
                  Åbn handling →
                </Link>
              </>
            ) : (
              <h2 className="text-xl font-semibold">
                Ingen aktuelle handlinger
              </h2>
            )}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-sm text-brand">
              <Link className="hover:underline" href={`${root}/actions`}>
                Alle handlinger →
              </Link>
              {organizationRole !== "viewer" && (
                <Link className="hover:underline" href={`${root}/tasks/my`}>
                  Mine opgaver →
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-canvas p-4 text-ink sm:p-6">
            {view === "news" ? recentMinutesSection : committeeSection}
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
              href={`${root}/committees/${nextMeeting.committee_id}/meetings/${nextMeeting.id}`}
            >
              Se dagsorden →
            </Link>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted">Ingen kommende møder</p>
        )}
        <Link
          className="mt-4 block w-fit text-sm text-muted hover:underline"
          href={`${root}/meetings`}
        >
          Åbn kalender →
        </Link>
      </aside>
    </div>
  );
}
