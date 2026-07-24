"use client";

import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AgendaItemCreateForm } from "@/components/agenda-items/agenda-item-create-form";
import { Button, Input, Modal, Select, Textarea } from "@/components/ui";
import type { MeetingCapabilities } from "@/lib/permissions";

type CommitteeOption = {
  id: string;
  name: string;
  capabilities: MeetingCapabilities;
};

type RouteContext = {
  committeeId: string | null;
  meetingId: string | null;
  agendaItemId: string | null;
};

function parseRouteContext(pathname: string): RouteContext {
  const segments = pathname.split("/").filter(Boolean);
  const valueAfter = (segment: string) => {
    const index = segments.indexOf(segment);
    const value = index >= 0 ? segments[index + 1] : null;
    if (!value || value === "new" || value === "edit") return null;
    return value;
  };

  return {
    committeeId: valueAfter("committees"),
    meetingId: valueAfter("meetings"),
    agendaItemId: valueAfter("agenda-items"),
  };
}

function datetimeLocalToIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function QuickActionMenu({
  organizationId,
  committees,
  style,
}: {
  organizationId: string;
  committees: CommitteeOption[];
  style?: CSSProperties;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const context = useMemo(() => parseRouteContext(pathname), [pathname]);
  const contextCommittee = committees.find(
    (committee) => committee.id === context.committeeId,
  );
  const meetingCommittees = committees.filter(
    (committee) => committee.capabilities.createMeeting,
  );
  const quickMeetingCommittees = committees.filter(
    (committee) => committee.capabilities.createQuickMeeting,
  );
  const defaultMeetingCommitteeId =
    (contextCommittee?.capabilities.createMeeting
      ? contextCommittee.id
      : null) ??
    (meetingCommittees.length === 1 ? meetingCommittees[0].id : "");
  const defaultQuickMeetingCommitteeId =
    (contextCommittee?.capabilities.createQuickMeeting
      ? contextCommittee.id
      : null) ??
    (quickMeetingCommittees.length === 1 ? quickMeetingCommittees[0].id : "");
  const meetingCommitteeLocked = Boolean(
    contextCommittee?.capabilities.createMeeting,
  );
  const quickMeetingCommitteeLocked = Boolean(
    contextCommittee?.capabilities.createQuickMeeting,
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [quickMeetingOpen, setQuickMeetingOpen] = useState(false);
  const [agendaItemOpen, setAgendaItemOpen] = useState(false);
  const [committeeId, setCommitteeId] = useState(defaultMeetingCommitteeId);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [quickNotes, setQuickNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function openMeetingModal() {
    setCommitteeId(defaultMeetingCommitteeId);
    setTitle("");
    setStartsAt("");
    setError(null);
    setFieldErrors({});
    setMenuOpen(false);
    setMeetingOpen(true);
  }

  function openQuickMeetingModal() {
    setCommitteeId(defaultQuickMeetingCommitteeId);
    setTitle("Hurtigt møde");
    setStartsAt("");
    setQuickNotes("");
    setError(null);
    setFieldErrors({});
    setMenuOpen(false);
    setQuickMeetingOpen(true);
  }

  async function submitMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    const selectedCommitteeId = meetingCommitteeLocked
      ? (contextCommittee?.id ?? "")
      : committeeId;
    const startsAtIso = datetimeLocalToIso(startsAt);
    const clientErrors: Record<string, string> = {};

    if (!selectedCommitteeId) {
      clientErrors.committeeId = "Vælg et udvalg.";
    }
    if (!title.trim()) {
      clientErrors.title = "Titel skal udfyldes.";
    }
    if (!startsAt.trim() || !startsAtIso) {
      clientErrors.startsAt = "Startdato mangler eller er ugyldig.";
    }

    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setError("Mødet kunne ikke oprettes.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/committees/${selectedCommitteeId}/meetings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            committeeId: selectedCommitteeId,
            title,
            description: "",
            startsAt: startsAtIso,
            endsAt: null,
            location: null,
          }),
        },
      );
      const result = (await response.json()) as {
        id?: string;
        error?: string;
        fieldErrors?: Record<string, string[]>;
      };

      if (!response.ok || !result.id) {
        setError(result.error || "Mødet kunne ikke oprettes.");
        setFieldErrors(
          Object.fromEntries(
            Object.entries(result.fieldErrors ?? {}).flatMap(
              ([key, messages]) => (messages[0] ? [[key, messages[0]]] : []),
            ),
          ),
        );
        return;
      }

      setMeetingOpen(false);
      router.push(
        `/organizations/${organizationId}/committees/${selectedCommitteeId}/meetings/${result.id}`,
      );
      router.refresh();
    } catch {
      setError(
        "Forbindelsen til serveren mislykkedes. Kontrollér din internetforbindelse, og prøv igen.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitQuickMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    const selectedCommitteeId = quickMeetingCommitteeLocked
      ? (contextCommittee?.id ?? "")
      : committeeId;
    const startsAtIso = datetimeLocalToIso(startsAt);
    const clientErrors: Record<string, string> = {};

    if (!selectedCommitteeId) {
      clientErrors.committeeId = "Vælg et udvalg.";
    }
    if (!title.trim()) {
      clientErrors.title = "Titel skal udfyldes.";
    }
    if (!startsAt.trim() || !startsAtIso) {
      clientErrors.startsAt = "Startdato mangler eller er ugyldig.";
    }

    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setError("Det hurtige møde kunne ikke oprettes.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/committees/${selectedCommitteeId}/meetings/quick`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            committeeId: selectedCommitteeId,
            title,
            description:
              "Hurtigt/ad hoc møde oprettet uden dagsorden via Quick Action.",
            startsAt: startsAtIso,
            endsAt: null,
            location: null,
            minutesText: quickNotes,
          }),
        },
      );
      const result = (await response.json()) as {
        id?: string;
        error?: string;
        fieldErrors?: Record<string, string[]>;
      };

      if (!response.ok || !result.id) {
        setError(result.error || "Det hurtige møde kunne ikke oprettes.");
        setFieldErrors(
          Object.fromEntries(
            Object.entries(result.fieldErrors ?? {}).flatMap(
              ([key, messages]) => (messages[0] ? [[key, messages[0]]] : []),
            ),
          ),
        );
        return;
      }

      setQuickMeetingOpen(false);
      router.push(
        `/organizations/${organizationId}/committees/${selectedCommitteeId}/meetings/${result.id}#general-minutes-content`,
      );
      router.refresh();
    } catch {
      setError(
        "Forbindelsen til serveren mislykkedes. Kontrollér din internetforbindelse, og prøv igen.",
      );
    } finally {
      setSaving(false);
    }
  }

  const canCreateAgendaItem = Boolean(
    context.committeeId &&
    context.meetingId &&
    contextCommittee?.capabilities.scheduleAgendaItem,
  );
  const canCreateMeeting = meetingCommittees.length > 0;
  const canCreateQuickMeeting = quickMeetingCommittees.length > 0;
  const canScheduleAgendaItem = committees.some(
    (committee) => committee.capabilities.scheduleAgendaItem,
  );

  return (
    <>
      <div className="relative">
        <Button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((current) => !current)}
          size="sm"
        >
          + Opret
        </Button>
        {menuOpen ? (
          <div
            className="absolute right-0 z-30 mt-2 w-72 rounded-[var(--radius-control)] border border-line bg-surface p-2 shadow-dialog"
            role="menu"
          >
            {canCreateMeeting ? (
              <button
                className="quick-action-item"
                onClick={openMeetingModal}
                role="menuitem"
                type="button"
              >
                <span className="font-semibold text-ink">Nyt møde</span>
                <span className="text-xs text-muted">
                  Vælg udvalg, titel og dato.
                </span>
              </button>
            ) : null}
            {canCreateQuickMeeting ? (
              <button
                className="quick-action-item"
                onClick={openQuickMeetingModal}
                role="menuitem"
                type="button"
              >
                <span className="font-semibold text-ink">Hurtigt møde</span>
                <span className="text-xs text-muted">
                  Ad hoc-møde uden dagsorden.
                </span>
              </button>
            ) : null}
            <button
              className="quick-action-item disabled"
              disabled
              role="menuitem"
              title="Opgaver oprettes fra opgave- eller mødekonteksten, hvor ansvarlige og relationer er tilgængelige."
              type="button"
            >
              <span className="font-semibold text-ink">Ny opgave</span>
              <span className="text-xs text-muted">
                Åbn Task View eller et møde først.
              </span>
            </button>
            <button
              className="quick-action-item disabled"
              disabled
              role="menuitem"
              title="Beslutninger oprettes fra beslutningsregisteret eller en mødekontekst med dato og punktrelationer."
              type="button"
            >
              <span className="font-semibold text-ink">Ny beslutning</span>
              <span className="text-xs text-muted">
                Åbn beslutninger eller et møde først.
              </span>
            </button>
            {canScheduleAgendaItem ? (
              <button
                className="quick-action-item"
                disabled={!canCreateAgendaItem}
                onClick={() => {
                  if (!canCreateAgendaItem) return;
                  setMenuOpen(false);
                  setAgendaItemOpen(true);
                }}
                role="menuitem"
                title={
                  canCreateAgendaItem
                    ? "Opret dagsordenspunkt på det åbne møde."
                    : "Vælg eller åbn et møde først"
                }
                type="button"
              >
                <span className="font-semibold text-ink">
                  Nyt dagsordenspunkt
                </span>
                <span className="text-xs text-muted">
                  {canCreateAgendaItem
                    ? "Opret på det aktuelle møde."
                    : "Vælg eller åbn et møde først"}
                </span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Modal
        description="Mødet oprettes med faste standardpunkter og åbnes efter gem."
        maxWidth="lg"
        onClose={() => setMeetingOpen(false)}
        open={meetingOpen}
        style={style}
        title="Opret nyt møde"
      >
        <form className="space-y-4" noValidate onSubmit={submitMeeting}>
          {error ? (
            <div
              className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm"
              role="alert"
            >
              <p className="font-semibold">{error}</p>
              {Object.values(fieldErrors).length > 0 ? (
                <ul className="mt-2 list-disc pl-5">
                  {[...new Set(Object.values(fieldErrors))].map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {meetingCommittees.length === 0 ? (
            <p className="metadata">
              Der findes endnu ikke et udvalg i organisationen. Opret et udvalg,
              før du opretter møder.
            </p>
          ) : meetingCommitteeLocked && contextCommittee ? (
            <div>
              <p className="label">Udvalg</p>
              <p className="rounded-[var(--radius-control)] border border-line bg-subtle px-3 py-2 text-sm text-ink">
                {contextCommittee.name}
              </p>
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="quick-action-committee">
                Udvalg
              </label>
              <Select
                aria-invalid={Boolean(fieldErrors.committeeId)}
                id="quick-action-committee"
                onChange={(event) => setCommitteeId(event.target.value)}
                value={committeeId}
              >
                <option value="">Vælg udvalg</option>
                {meetingCommittees.map((committee) => (
                  <option key={committee.id} value={committee.id}>
                    {committee.name}
                  </option>
                ))}
              </Select>
              {meetingCommittees.length > 1 ? (
                <p className="mt-1 text-xs text-muted">
                  Organisationen har flere udvalg, så du skal vælge udvalg
                  aktivt.
                </p>
              ) : null}
            </div>
          )}

          <div>
            <label className="label" htmlFor="quick-action-meeting-title">
              Titel
            </label>
            <Input
              aria-invalid={Boolean(fieldErrors.title)}
              id="quick-action-meeting-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </div>
          <div>
            <label className="label" htmlFor="quick-action-meeting-starts-at">
              Dato og tid
            </label>
            <Input
              aria-invalid={Boolean(fieldErrors.startsAt)}
              id="quick-action-meeting-starts-at"
              onChange={(event) => setStartsAt(event.target.value)}
              type="datetime-local"
              value={startsAt}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              onClick={() => setMeetingOpen(false)}
              size="sm"
              variant="secondary"
            >
              Annuller
            </Button>
            <Button
              disabled={saving || meetingCommittees.length === 0}
              size="sm"
              type="submit"
            >
              {saving ? "Opretter..." : "Opret møde"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        description="Opret et ad hoc-møde uden dagsorden og start direkte med frie noter."
        maxWidth="lg"
        onClose={() => setQuickMeetingOpen(false)}
        open={quickMeetingOpen}
        style={style}
        title="Hurtigt møde"
      >
        <form className="space-y-4" noValidate onSubmit={submitQuickMeeting}>
          {error ? (
            <div
              className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm"
              role="alert"
            >
              <p className="font-semibold">{error}</p>
              {Object.values(fieldErrors).length > 0 ? (
                <ul className="mt-2 list-disc pl-5">
                  {[...new Set(Object.values(fieldErrors))].map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {quickMeetingCommittees.length === 0 ? (
            <p className="metadata">
              Der findes endnu ikke et udvalg i organisationen. Opret et udvalg,
              før du opretter møder.
            </p>
          ) : quickMeetingCommitteeLocked && contextCommittee ? (
            <div>
              <p className="label">Udvalg</p>
              <p className="rounded-[var(--radius-control)] border border-line bg-subtle px-3 py-2 text-sm text-ink">
                {contextCommittee.name}
              </p>
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="quick-meeting-committee">
                Udvalg
              </label>
              <Select
                aria-invalid={Boolean(fieldErrors.committeeId)}
                id="quick-meeting-committee"
                onChange={(event) => setCommitteeId(event.target.value)}
                value={committeeId}
              >
                <option value="">Vælg udvalg</option>
                {quickMeetingCommittees.map((committee) => (
                  <option key={committee.id} value={committee.id}>
                    {committee.name}
                  </option>
                ))}
              </Select>
              {quickMeetingCommittees.length > 1 ? (
                <p className="mt-1 text-xs text-muted">
                  Organisationen har flere udvalg, så du skal vælge udvalg
                  aktivt.
                </p>
              ) : null}
            </div>
          )}

          <div>
            <label className="label" htmlFor="quick-meeting-title">
              Titel
            </label>
            <Input
              aria-invalid={Boolean(fieldErrors.title)}
              id="quick-meeting-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </div>
          <div>
            <label className="label" htmlFor="quick-meeting-starts-at">
              Dato og tid
            </label>
            <Input
              aria-invalid={Boolean(fieldErrors.startsAt)}
              id="quick-meeting-starts-at"
              onChange={(event) => setStartsAt(event.target.value)}
              type="datetime-local"
              value={startsAt}
            />
          </div>
          <div>
            <label className="label" htmlFor="quick-meeting-notes">
              Frie noter / referat
            </label>
            <Textarea
              className="min-h-40"
              id="quick-meeting-notes"
              onChange={(event) => setQuickNotes(event.target.value)}
              placeholder="Skriv de første noter fra mødet her. De gemmes som generelt mødereferat."
              value={quickNotes}
            />
            <p className="mt-1 text-xs text-muted">
              Mødet oprettes uden dagsordenspunkter, så du kan starte med et
              frit referat med det samme.
            </p>
          </div>

          <div className="rounded-[var(--radius-control)] border border-line bg-subtle/45 px-3 py-2 text-xs text-muted">
            <p className="font-semibold text-ink">Strukturer med AI</p>
            <p className="mt-1">
              Kommer senere som review-flow. AI opretter ikke dagsordenspunkter,
              beslutninger eller opgaver automatisk.
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              onClick={() => setQuickMeetingOpen(false)}
              size="sm"
              variant="secondary"
            >
              Annuller
            </Button>
            <Button
              disabled={saving || quickMeetingCommittees.length === 0}
              size="sm"
              type="submit"
            >
              {saving ? "Opretter..." : "Opret hurtigt møde"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        description="Dagsordenspunktet oprettes på det aktuelle møde og kan redigeres bagefter."
        maxWidth="2xl"
        onClose={() => setAgendaItemOpen(false)}
        open={agendaItemOpen}
        style={style}
        title="Opret dagsordenspunkt"
      >
        {context.committeeId && context.meetingId ? (
          <AgendaItemCreateForm
            committeeId={context.committeeId}
            meetingId={context.meetingId}
            meetings={[
              {
                id: context.meetingId,
                title: "Aktuelt møde",
                starts_at: new Date().toISOString(),
              },
            ]}
            onCancel={() => setAgendaItemOpen(false)}
            onSuccess={() => {
              setAgendaItemOpen(false);
              router.refresh();
            }}
            organizationId={organizationId}
            submitLabel="Opret dagsordenspunkt"
          />
        ) : (
          <p className="metadata">Vælg eller åbn et møde først.</p>
        )}
      </Modal>
    </>
  );
}
