"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { AppIcon } from "@/components/icons/app-icon";
import {
  Button,
  buttonClassName,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui";
import {
  sponsorFields,
  type SponsorProposal,
  type SponsorRow,
} from "@/lib/sponsor-import";

type Group = SponsorProposal["kind"] | "all";
type Preview = { proposals: SponsorProposal[]; revision: string };
const labels = {
  all: "Alle",
  new: "Nye sponsorer",
  update: "Opdateringer",
  review: "Skal tjekkes",
  unchanged: "Uændrede",
};
const primaryAction = "!bg-blue-700 !text-white hover:!bg-blue-800";
const secondaryAction =
  "!border !border-line-strong !bg-surface !text-brand hover:!bg-brand-soft";

const pageSize = 8;

export function SponsorImport({ organizationId }: { organizationId: string }) {
  const root = `/organizations/${organizationId}/stakeholders`;
  const endpoint = `/api${root}/import`;
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<SponsorRow[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [group, setGroup] = useState<Group>("all");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const proposals = preview?.proposals ?? [];
  const visible = proposals
    .map((proposal, index) => ({ proposal, index }))
    .filter(({ proposal }) => group === "all" || proposal.kind === group);
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const allClearSelected = proposals.every(
    ({ kind }, index) =>
      kind === "review" || kind === "unchanged" || selected[index],
  );
  const clearCount = proposals.filter(
    ({ kind }) => kind === "new" || kind === "update",
  ).length;
  const selectionCount = Object.keys(selected).length;
  const pendingReview = proposals.filter(
    ({ kind }, index) => kind === "review" && !selected[index],
  ).length;
  const active = detail === null ? undefined : proposals[detail];
  const activeMatch =
    detail === null
      ? undefined
      : active?.candidates.find(({ id }) => id === selected[detail]);
  const displayMatch =
    detail !== null && selected[detail] === "new"
      ? undefined
      : (activeMatch ??
        (active?.kind === "update" || active?.kind === "unchanged"
          ? active.candidates[0]
          : undefined));
  const changes =
    displayMatch?.changes ??
    (active
      ? Object.entries(active.row.fields).map(([key, after]) => ({
          label: sponsorFields[key as keyof typeof sponsorFields],
          before: null,
          after,
        }))
      : []);

  async function request(body: unknown) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error ?? "Importen kunne ikke gennemføres.");
    return result;
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Importen kunne ikke gennemføres.",
      );
    } finally {
      setBusy(false);
    }
  }

  function selectClear(
    next: Preview,
    current: Record<number, string> = {},
    enabled = true,
  ) {
    const result = { ...current };
    next.proposals.forEach((proposal, index) => {
      if (proposal.kind === "review" || proposal.kind === "unchanged") return;
      if (enabled)
        result[index] =
          proposal.kind === "new" ? "new" : proposal.candidates[0].id;
      else delete result[index];
    });
    setSelected(result);
  }

  function select(index: number, value: string) {
    setSelected((previous) => {
      const next = { ...previous };
      if (value) next[index] = value;
      else delete next[index];
      return next;
    });
  }

  async function getPreview(entries: SponsorRow[]) {
    const next: Preview = await request({ rows: entries });
    setPreview(next);
    selectClear(next);
    setGroup("all");
    setPage(0);
    setSaved(null);
  }

  return (
    <div className="space-y-3">
      <Link
        className={buttonClassName({
          variant: "secondary",
          size: "sm",
          className: secondaryAction,
        })}
        href={root}
      >
        <AppIcon name="arrowLeft" size={16} aria-hidden="true" />
        Til interessentregistret
      </Link>
      <PageHeader className="!pb-2" title="Importér sponsorer fra Excel" />
      <div className="panel flex flex-col items-start gap-2 p-3 sm:flex-row sm:items-center sm:gap-3">
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file || busy) return;
            void run(async () => {
              const { readSponsorXlsx } =
                await import("@/lib/read-sponsor-xlsx");
              const { sponsors, ignored } = await readSponsorXlsx(file);
              await getPreview(sponsors);
              setFileName(file.name);
              setRows(sponsors);
              setIgnored(ignored);
            });
          }}
        />
        <Button
          className={primaryAction}
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <AppIcon name="upload" size={17} aria-hidden="true" />
          {fileName ? "Vælg en anden Excel-fil" : "Vælg Excel-fil"}
        </Button>
        {fileName ? (
          <span className="break-all text-sm text-muted">{fileName}</span>
        ) : (
          <span className="text-sm text-muted">
            .xlsx med kolonnen Firmanavn
          </span>
        )}
        {busy ? (
          <span className="text-sm text-muted" role="status">
            Arbejder …
          </span>
        ) : null}
      </div>
      {error ? (
        <div
          className="flex flex-wrap items-center gap-2 text-sm text-danger"
          role="alert"
        >
          {error}
          {preview && !saved ? (
            <Button
              size="sm"
              variant="secondary"
              className={secondaryAction}
              disabled={busy}
              onClick={() => void run(() => getPreview(rows))}
            >
              Beregn forslag igen
            </Button>
          ) : null}
        </div>
      ) : null}
      {saved !== null ? (
        <div className="panel p-4" role="status">
          <p className="font-semibold">{saved} sponsorrækker er gemt.</p>
          <Link className="text-sm text-brand underline" href={root}>
            Åbn interessentregistret
          </Link>
        </div>
      ) : null}
      {preview && saved === null ? (
        <>
          {ignored.length ? (
            <details className="text-sm text-muted">
              <summary>{ignored.length} rækker kunne ikke læses</summary>
              <ul>
                {ignored.slice(0, 50).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <section
            className="panel min-w-0 space-y-2 p-3"
            aria-label="Besties importforslag"
          >
            <div className="flex flex-wrap gap-1 border-b border-line pb-2">
              {(Object.keys(labels) as Group[]).map((key) => (
                <Button
                  className={group === key ? primaryAction : secondaryAction}
                  key={key}
                  aria-pressed={group === key}
                  size="sm"
                  variant={group === key ? "primary" : "secondary"}
                  onClick={() => {
                    setGroup(key);
                    setPage(0);
                  }}
                >
                  {labels[key]} (
                  {key === "all"
                    ? proposals.length
                    : proposals.filter(({ kind }) => kind === key).length}
                  )
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allClearSelected && clearCount > 0}
                  disabled={clearCount === 0 || busy}
                  onChange={(event) =>
                    selectClear(preview, selected, event.target.checked)
                  }
                />{" "}
                Markér alle klare forslag
              </label>
              <span className="text-muted">
                {selectionCount} valgt
                {pendingReview ? ` · ${pendingReview} afventer valg` : ""}
              </span>
            </div>
            <ul className="divide-y divide-line">
              {visible
                .slice(page * pageSize, (page + 1) * pageSize)
                .map(({ proposal, index }) => {
                  const { row, kind, candidates, reason } = proposal;
                  const match =
                    candidates.find(({ id }) => id === selected[index]) ??
                    (kind === "update" ? candidates[0] : undefined);
                  return (
                    <li
                      key={index}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-1.5 sm:gap-3"
                    >
                      <input
                        type="checkbox"
                        aria-label={`Medtag ${row.fields.name}`}
                        className="size-4"
                        checked={Boolean(selected[index])}
                        disabled={
                          busy ||
                          kind === "unchanged" ||
                          (kind === "review" && !selected[index])
                        }
                        onChange={(event) =>
                          select(
                            index,
                            event.target.checked
                              ? kind === "new"
                                ? "new"
                                : (candidates[0]?.id ?? "")
                              : "",
                          )
                        }
                      />
                      <div className="min-w-0 break-words text-sm">
                        <strong>{row.fields.name}</strong>
                        <p className="text-xs text-muted">
                          {kind === "unchanged"
                            ? "Allerede opdateret"
                            : selected[index] === "new"
                              ? "Opret"
                              : match
                                ? `Opdatér ${match.name} · ${match.changes.length + Number(match.contact)} ændringer`
                                : (reason ?? "Opret")}{" "}
                          · {row.source}, række {row.row}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className={secondaryAction}
                        onClick={() => setDetail(index)}
                      >
                        {kind === "review" ? "Tjek" : "Se felter"}
                      </Button>
                    </li>
                  );
                })}
            </ul>
            {!visible.length ? (
              <p className="text-sm text-muted">Ingen forslag her.</p>
            ) : null}
            {totalPages > 1 ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <Button
                  variant="secondary"
                  className={secondaryAction}
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Forrige
                </Button>
                <span>
                  Side {page + 1} af {totalPages}
                </span>
                <Button
                  variant="secondary"
                  className={secondaryAction}
                  size="sm"
                  disabled={page + 1 === totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Næste
                </Button>
              </div>
            ) : null}
          </section>
          <div className="sticky bottom-0 z-10 flex justify-end border-t border-line bg-surface p-2">
            <Button
              className={primaryAction}
              disabled={!selectionCount || busy}
              onClick={() => setConfirm(true)}
            >
              Godkend {selectionCount} valgte
            </Button>
          </div>
        </>
      ) : null}
      {active && detail !== null ? (
        <Modal
          open
          title={active.row.fields.name}
          onClose={() => setDetail(null)}
          maxWidth="lg"
          footer={
            <Button className={primaryAction} onClick={() => setDetail(null)}>
              Tilbage til oversigten
            </Button>
          }
        >
          <div className="space-y-3">
            {active.kind === "review" ? (
              <>
                <p className="text-sm text-muted">{active.reason}</p>
                <label className="block text-sm font-semibold">
                  Handling
                  <Select
                    value={selected[detail] ?? ""}
                    onChange={(event) => select(detail, event.target.value)}
                  >
                    <option value="">Spring over</option>
                    <option value="new">Opret som ny sponsor</option>
                    {active.candidates.map((candidate) => (
                      <option
                        key={candidate.id}
                        value={candidate.id}
                        disabled={candidate.archived}
                      >
                        {candidate.name}
                        {candidate.city ? ` · ${candidate.city}` : ""}
                        {candidate.cvr_number
                          ? ` · CVR ${candidate.cvr_number}`
                          : ""}{" "}
                        · {candidate.archived ? "Arkiveret" : candidate.reason}
                      </option>
                    ))}
                  </Select>
                </label>
              </>
            ) : null}
            <dl className="divide-y divide-line text-sm">
              {changes.map(({ label, before, after }) => (
                <div className="py-1" key={label}>
                  <dt className="font-semibold">{label}</dt>
                  <dd className="break-words">
                    {before ? `${before} → ` : ""}
                    {after}
                  </dd>
                </div>
              ))}
              {active.row.contact ? (
                <div className="py-1">
                  <dt className="font-semibold">Kontaktperson</dt>
                  <dd>
                    {active.row.contact}
                    {displayMatch && !displayMatch.contact
                      ? " · findes allerede"
                      : " · tilføjes"}
                  </dd>
                </div>
              ) : null}
              {!displayMatch && active.ownerName ? (
                <div className="py-1">
                  <dt className="font-semibold">Intern ansvarlig</dt>
                  <dd>{active.ownerName}</dd>
                </div>
              ) : null}
            </dl>
            {active.row.details.length ||
            (active.row.owner && !active.ownerName) ? (
              <details className="text-sm text-muted">
                <summary>Øvrige oplysninger fra Excel</summary>
                <p>Aftale- og betalingsfelter gemmes ikke ved denne import.</p>
                <dl>
                  {active.row.details.map(([label, value], index) => (
                    <div key={index} className="break-words py-1">
                      <dt className="font-semibold">{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                  {active.row.owner && !active.ownerName ? (
                    <div>
                      <dt>Intern klubansvarlig</dt>
                      <dd>{active.row.owner}</dd>
                    </div>
                  ) : null}
                </dl>
              </details>
            ) : null}
          </div>
        </Modal>
      ) : null}
      {confirm ? (
        <Modal
          open
          title={`Gem ${selectionCount} valgte sponsorrækker?`}
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
          maxWidth="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                className={secondaryAction}
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Tilbage
              </Button>
              <Button
                className={primaryAction}
                disabled={busy}
                onClick={() => {
                  setConfirm(false);
                  void run(async () => {
                    const result = await request({
                      rows,
                      approval: {
                        revision: preview!.revision,
                        selections: selected,
                      },
                    });
                    setSaved(result.saved);
                  });
                }}
              >
                Gem import
              </Button>
            </div>
          }
        >
          <p className="text-sm">
            {pendingReview
              ? `${pendingReview} forslag uden et valgt match springes over.`
              : "De valgte forslag gemmes i interessentregistret."}{" "}
            Aftale- og betalingsoplysninger vises kun i forhåndsvisningen.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
