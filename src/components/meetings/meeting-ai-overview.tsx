"use client";

import { useState } from "react";

import { Button, Modal, StatusBadge } from "@/components/ui";
import type { AiMeetingOverviewOutput } from "@/lib/ai-meeting-overview";

type OverviewResponse =
  | {
      status: "ok";
      overview: AiMeetingOverviewOutput;
      activityLogId: string | null;
      model: string;
      promptVersion: string;
      usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      } | null;
    }
  | {
      status: "empty";
      overview: null;
      model: null;
      promptVersion: string;
      usage: null;
    };

function OverviewList({
  items,
  emptyText,
}: {
  items: string[];
  emptyText: string;
}) {
  if (!items.length) {
    return <p className="text-sm text-muted">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2 text-sm leading-6">
      {items.map((item) => (
        <li className="flex gap-2" key={item}>
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function OverviewSection({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2">
        <OverviewList emptyText={emptyText} items={items} />
      </div>
    </section>
  );
}

export function MeetingAiOverview({
  organizationId,
  committeeId,
  meetingId,
}: {
  organizationId: string;
  committeeId: string;
  meetingId: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OverviewResponse | null>(null);

  async function generateOverview() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/meetings/${meetingId}/overview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          committeeId,
          meetingId,
        }),
      });
      const body = (await response.json()) as OverviewResponse & {
        error?: string;
      };
      if (!response.ok) {
        setError(body.error || "AI kunne ikke generere overblikket lige nu.");
        return;
      }
      setResult(body);
    } catch {
      setError(
        "Forbindelsen til serveren mislykkedes. Kontrollér din internetforbindelse, og prøv igen.",
      );
    } finally {
      setLoading(false);
    }
  }

  const overview = result?.status === "ok" ? result.overview : null;
  const activityLogId =
    result?.status === "ok" ? result.activityLogId : null;

  return (
    <>
      <Button onClick={generateOverview} size="sm" variant="secondary">
        AI-overblik
      </Button>
      <Modal
        description="AI-overblikket er forberedelsesstøtte og gemmes ikke som officielt referat."
        maxWidth="3xl"
        onClose={() => setOpen(false)}
        open={open}
        title="AI-genereret mødeoverblik"
      >
        {loading ? (
          <div className="rounded-[var(--radius-control)] border border-line bg-subtle px-4 py-5 text-sm text-muted">
            AI gennemgår møde, dagsorden, referat, beslutninger og opgaver...
          </div>
        ) : null}

        {error ? (
          <div
            className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm"
            role="alert"
          >
            <p className="font-semibold">{error}</p>
            <Button
              className="mt-3"
              onClick={generateOverview}
              size="sm"
              variant="secondary"
            >
              Prøv igen
            </Button>
          </div>
        ) : null}

        {!loading && result?.status === "empty" ? (
          <div className="rounded-[var(--radius-control)] border border-line bg-subtle px-4 py-5">
            <p className="font-semibold">Der er ikke nok mødedata endnu.</p>
            <p className="mt-1 text-sm text-muted">
              Tilføj dagsordenspunkter, beskrivelser eller referattekst, og prøv
              igen.
            </p>
          </div>
        ) : null}

        {overview ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="info">AI-genereret forslag</StatusBadge>
              {activityLogId ? (
                <StatusBadge tone="neutral">AI-historik gemt</StatusBadge>
              ) : null}
              <span className="text-xs text-muted">
                Ikke officiel dokumentation
              </span>
            </div>

            <section>
              <h3 className="text-sm font-semibold">Kort overblik</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink">
                {overview.summary}
              </p>
            </section>

            <OverviewSection
              emptyText="Der er ingen sikre dagsordenspunkter at fremhæve."
              items={overview.agenda_summary}
              title="Dagsorden"
            />
            <OverviewSection
              emptyText="Der er endnu ikke referattekst at opsummere."
              items={overview.minutes_summary}
              title="Referat"
            />
            <OverviewSection
              emptyText="AI fandt ingen tydelige beslutningspunkter."
              items={overview.key_decision_points}
              title="Beslutningspunkter"
            />
            <OverviewSection
              emptyText="AI fandt ingen tydelige opfølgningspunkter."
              items={overview.follow_up_points}
              title="Opfølgning"
            />
            <OverviewSection
              emptyText="AI fandt ingen særlige forberedelsespunkter."
              items={overview.preparation_points}
              title="Forberedelse"
            />
            <OverviewSection
              emptyText="AI fandt ingen særlige opmærksomhedspunkter."
              items={overview.risks_or_attention_points}
              title="Vær særligt opmærksom på"
            />

            <section className="border-t border-line pt-4">
              <h3 className="text-sm font-semibold">Begrænsning</h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                {overview.confidence_note}
              </p>
            </section>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
