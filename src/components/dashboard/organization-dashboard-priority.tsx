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
        className="min-w-0 overflow-hidden rounded-2xl border border-[#233d55] bg-[#0c1b2b] text-[#e7f0fa] shadow-xl"
        aria-label="Fokus"
      >
        <div className="flex flex-wrap items-center gap-1 border-b border-[#294057] bg-[#122437] p-2">
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
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${view === id ? "bg-[#25455d] text-cyan-100" : "text-slate-300 hover:bg-[#1c354a]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "actions" ? (
          <div className="bg-[radial-gradient(ellipse_at_top_right,#173b4b,transparent_70%)] p-4 sm:p-6">
            {action ? (
              <>
                <div
                  className="mb-5 flex flex-wrap gap-2"
                  aria-label="Vælg handling"
                >
                  {actions.map((item, index) => (
                    <button
                      key={item.key}
                      type="button"
                      aria-label={item.title}
                      aria-pressed={item.key === action.key}
                      onClick={() => setSelected(item.key)}
                      className={`flex min-h-10 min-w-10 items-center justify-center rounded-lg border font-mono text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${item.key === action.key ? "border-cyan-300 bg-cyan-200 text-[#102536]" : "border-[#45617b] text-slate-200 hover:bg-[#25455d]"}`}
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
                <h2 className="mt-3 max-w-xl break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                  {action.title}
                </h2>
                <p className="mt-2 text-sm text-slate-300">
                  {action.description}{" "}
                  <span className="text-slate-400">{action.context}</span>
                </p>
                <Link
                  className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-cyan-200 px-4 text-sm font-bold text-[#102536] hover:bg-cyan-100"
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
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-[#365269] pt-3 text-sm text-cyan-100">
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
        className="overflow-hidden rounded-2xl border border-[#294057] bg-[#122437] p-5 text-[#e7f0fa] shadow-lg"
        aria-label="Næste møde"
      >
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-cyan-200">
          <AppIcon name="calendar" size={16} /> Næste møde
        </div>
        {nextMeeting ? (
          <>
            <time
              dateTime={nextMeeting.starts_at}
              className="mt-5 block font-mono text-xl text-cyan-100"
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
            <p className="mt-1 text-sm text-slate-300">
              {nextMeeting.committeeName}
            </p>
            <Link
              className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-[#52758b] px-3 text-sm font-semibold text-cyan-100 hover:bg-[#25455d]"
              href={`${root}/committees/${nextMeeting.committee_id}/meetings/${nextMeeting.id}`}
            >
              Se dagsorden →
            </Link>
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-300">Ingen kommende møder</p>
        )}
        <Link
          className="mt-4 block w-fit text-sm text-slate-300 hover:underline"
          href={`${root}/meetings`}
        >
          Åbn kalender →
        </Link>
      </aside>
    </div>
  );
}
