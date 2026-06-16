"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AgendaItemDocumentTitle } from "@/components/agenda-items/agenda-item-document-title";
import {
  Button,
  EmptyState,
  Select,
  StatusBadge,
  type StatusTone,
} from "@/components/ui";
import {
  agendaItemMinutesStatusLabels,
  agendaItemTypeLabels,
  agendaItemTransferReasonLabels,
  formatDate,
  formatDateTime,
  transferredAgendaItemStatusLabels,
} from "@/lib/localization";
import type {
  TransferMeetingOption,
  TransferredAgendaItemView,
} from "@/types/domain";

const transferStatusTones: Record<
  TransferredAgendaItemView["status"],
  StatusTone
> = {
  pending: "warning",
  scheduled: "info",
  dismissed: "neutral",
};

async function readResponse(response: Response) {
  const result = (await response.json()) as {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(result.error || "Overførslen kunne ikke opdateres.");
  }
  return result;
}

export function TransferredAgendaItemsSection({
  items,
  futureMeetings,
  canEdit,
  root,
}: {
  items: TransferredAgendaItemView[];
  futureMeetings: TransferMeetingOption[];
  canEdit: boolean;
  root: string;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [meetingSelections, setMeetingSelections] = useState<
    Record<string, string>
  >({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function schedule(item: TransferredAgendaItemView) {
    setLoadingId(item.id);
    setMessage(null);
    setError(null);
    try {
      const selection = meetingSelections[item.id] ?? "next";
      const result = await readResponse(
        await fetch(`/api/transferred-agenda-items/${item.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meetingId: selection === "next" ? null : selection,
          }),
        }),
      );
      setMessage(result.message || "Punktet er overført til mødet.");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Punktet kunne ikke overføres til mødet.",
      );
    } finally {
      setLoadingId(null);
    }
  }

  async function dismiss(item: TransferredAgendaItemView) {
    if (
      !window.confirm(
        `Er du sikker på, at du vil afvise overførslen af "${item.sourceAgendaItem.title}"?`,
      )
    ) {
      return;
    }

    setLoadingId(item.id);
    setMessage(null);
    setError(null);
    try {
      const result = await readResponse(
        await fetch(`/api/transferred-agenda-items/${item.id}`, {
          method: "PATCH",
        }),
      );
      setMessage(result.message || "Overførslen er afvist.");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Overførslen kunne ikke afvises.",
      );
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section className="mt-10 border-t border-line pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="page-eyebrow">Videreførelse</p>
          <h3 className="section-title mt-1">Overførte punkter</h3>
          <p className="mt-1 text-sm text-muted">
            Punkter fra referatet, der bør behandles på et kommende møde.
          </p>
        </div>
        <span className="text-sm font-medium text-muted">
          {items.length} {items.length === 1 ? "punkt" : "punkter"}
        </span>
      </div>

      {message ? (
        <div
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {message}
        </div>
      ) : null}
      {error ? (
        <div
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-5 divide-y divide-line border-y border-line">
        {items.map((item) => (
          <article
            className="border-l-4 border-l-progress/35 py-5 pl-4"
            key={item.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    className="font-bold text-forest hover:underline"
                    href={`${root}/agenda-items/${item.sourceAgendaItem.id}`}
                  >
                    <AgendaItemDocumentTitle
                      title={item.sourceAgendaItem.title}
                      type={item.sourceAgendaItem.item_type}
                    />
                  </Link>
                  <StatusBadge tone={transferStatusTones[item.status]}>
                    {transferredAgendaItemStatusLabels[item.status]}
                  </StatusBadge>
                </div>
                <dl className="mt-3 space-y-1 text-sm text-slate-600">
                  <div>
                    <dt className="inline font-semibold text-slate-700">
                      Overført fra:{" "}
                    </dt>
                    <dd className="inline">
                      <Link
                        className="text-forest hover:underline"
                        href={`${root}/meetings/${item.sourceMeeting.id}`}
                      >
                        {item.sourceMeeting.title}
                      </Link>
                      {" · "}
                      {formatDate(item.sourceMeeting.starts_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-slate-700">
                      Årsag:{" "}
                    </dt>
                    <dd className="inline">
                      {agendaItemTransferReasonLabels[item.transfer_reason]}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-slate-700">
                      Kildestatus:{" "}
                    </dt>
                    <dd className="inline">
                      {agendaItemMinutesStatusLabels[item.source_status]}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-slate-700">
                      Overføres som:{" "}
                    </dt>
                    <dd className="inline">
                      {agendaItemTypeLabels[item.target_item_type].short} /{" "}
                      {agendaItemTypeLabels[item.target_item_type].label}
                    </dd>
                  </div>
                </dl>

                {item.status === "scheduled" && item.targetMeeting ? (
                  <p className="mt-4 border-l-4 border-info/35 bg-info-soft px-4 py-3 text-sm text-info">
                    Planlagt på{" "}
                    <Link
                      className="font-semibold underline"
                      href={`${root}/meetings/${item.targetMeeting.id}`}
                    >
                      {item.targetMeeting.title}
                    </Link>{" "}
                    den {formatDateTime(item.targetMeeting.starts_at)}.
                    {item.target_agenda_item_id ? (
                      <>
                        {" "}
                        <Link
                          className="font-semibold underline"
                          href={`${root}/agenda-items/${item.target_agenda_item_id}`}
                        >
                          Åbn det overførte punkt
                        </Link>
                        .
                      </>
                    ) : null}
                  </p>
                ) : null}

                {item.status === "pending" && futureMeetings.length === 0 ? (
                  <div className="mt-4 border-l-4 border-warning/35 bg-warning-soft px-4 py-3 text-sm text-warning">
                    <p className="font-semibold">
                      Der findes ikke et kommende møde i dette udvalg endnu.
                    </p>
                    <p className="mt-1">
                      Punktet overføres, når et kommende møde er valgt.
                    </p>
                  </div>
                ) : null}
              </div>

              {canEdit && item.status === "pending" ? (
                <div className="w-full space-y-3 border-t border-line pt-4 sm:w-80 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                  <div>
                    <p className="text-sm font-bold">Overfør til møde</p>
                    <label
                      className="mt-3 block text-sm font-semibold"
                      htmlFor={`target-meeting-${item.id}`}
                    >
                      Møde
                    </label>
                    <p className="mt-1 text-xs text-slate-500">
                      Vælg hvilket møde punktet skal overføres til.
                    </p>
                    <Select
                      className="mt-2"
                      disabled={futureMeetings.length === 0}
                      id={`target-meeting-${item.id}`}
                      onChange={(event) =>
                        setMeetingSelections((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                      value={meetingSelections[item.id] ?? "next"}
                    >
                      <option value="next">
                        Næstkommende møde i dette udvalg
                      </option>
                      {futureMeetings.map((meeting) => (
                        <option key={meeting.id} value={meeting.id}>
                          {meeting.title} · {formatDate(meeting.starts_at)}
                        </option>
                      ))}
                    </Select>
                    {futureMeetings.length === 0 ? (
                      <p className="mt-2 text-xs font-medium text-amber-800">
                        Intet kommende møde fundet
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={
                        loadingId === item.id || futureMeetings.length === 0
                      }
                      onClick={() => schedule(item)}
                      type="button"
                    >
                      {loadingId === item.id
                        ? "Overfører..."
                        : "Overfør til møde"}
                    </Button>
                    <Button
                      disabled={loadingId === item.id}
                      onClick={() => dismiss(item)}
                      type="button"
                      variant="secondary"
                    >
                      Afvis overførsel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </article>
        ))}

        {items.length === 0 ? (
          <EmptyState title="Der er ingen punkter fra dette møde, som afventer overførsel." />
        ) : null}
      </div>
    </section>
  );
}
