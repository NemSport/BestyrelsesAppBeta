"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { Button, Input, PageHeader, Select, Textarea } from "@/components/ui";
import {
  meetingImportMaxBytes,
  meetingImportMaxFiles,
  type MeetingImportApproval,
  type MeetingImportPreview,
} from "@/lib/meeting-import";

const primary = "!bg-blue-700 !text-white hover:!bg-blue-800";
type Source = MeetingImportPreview["items"][number]["source"];
type Point = MeetingImportApproval["items"][number];
type Action = Point["decisions"][number];

export function HistoricalMeetingImport({
  organizationId,
  committees,
  members,
}: {
  organizationId: string;
  committees: { id: string; name: string }[];
  members: { id: string; name: string; committees: string[] }[];
}) {
  const root = `/organizations/${organizationId}`;
  const input = useRef<HTMLInputElement>(null);
  const [committee, setCommittee] = useState(
    committees.length === 1 ? committees[0].id : "",
  );
  const [preview, setPreview] = useState<MeetingImportPreview | null>(null);
  const [proposal, setProposal] = useState<MeetingImportApproval | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const availableMembers = members.filter((member) =>
    member.committees.includes(committee),
  );
  const showSource = (source: Source) =>
    [fileNames[source.file - 1], source.page ? `side ${source.page}` : ""]
      .filter(Boolean)
      .join(" · ");

  async function request(
    body: FormData | MeetingImportApproval,
    operation: "read" | "save",
  ) {
    setBusy(operation);
    setError("");
    try {
      const response = await fetch(
        `/api${root}/committees/${committee}/meeting-import`,
        {
          method: "POST",
          headers:
            body instanceof FormData
              ? undefined
              : { "Content-Type": "application/json" },
          body: body instanceof FormData ? body : JSON.stringify(body),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.validationErrors?.[0]?.message || result.error);
      return result;
    } catch (error) {
      setError(
        error instanceof Error && error.message
          ? error.message
          : "Mødeimporten kunne ikke gennemføres.",
      );
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function readFiles(files: File[]) {
    if (!files.length || busy || !committee) return;
    if (
      files.length > meetingImportMaxFiles ||
      files.reduce((size, file) => size + file.size, 0) > meetingImportMaxBytes
    ) {
      setError("Vælg højst 4 filer på maks. 4 MB tilsammen.");
      return;
    }
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    const result: (MeetingImportPreview & { analysisId: string }) | null =
      await request(form, "read");
    if (!result) return;
    setPreview(result);
    setSaved("");
    setFileNames(files.map(({ name }) => name));
    setProposal({
      analysisId: result.analysisId,
      title: result.title,
      date: result.date ?? "",
      time: result.time ?? "",
      location: result.location,
      summary: result.summary,
      items: result.items.map((point) => ({
        ...point,
        tasks: point.tasks.map((task) => ({
          ...task,
          deadline: task.deadline ?? "",
          responsibleUserId: "",
        })),
      })),
    });
  }

  function changePoint(index: number, patch: Partial<Point>) {
    setProposal(
      (current) =>
        current && {
          ...current,
          items: current.items.map((point, position) =>
            position === index ? { ...point, ...patch } : point,
          ),
        },
    );
  }

  function updateEntry<T extends Action>(
    entries: T[],
    index: number,
    patch: Partial<T>,
  ) {
    return entries.map((entry, position) =>
      position === index ? { ...entry, ...patch } : entry,
    );
  }

  return (
    <div className="space-y-3">
      <Link
        href={`${root}/meetings?period=previous`}
        className="text-sm font-medium text-brand underline"
      >
        Til mødeoversigten
      </Link>
      <PageHeader title="Importér referat og mødenoter" className="!pb-2" />
      <section className="panel flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-40 text-sm">
          <span className="label">Udvalg</span>
          <Select
            value={committee}
            disabled={Boolean(busy)}
            onChange={(event) => {
              setCommittee(event.target.value);
              setPreview(null);
              setProposal(null);
              setFileNames([]);
              setError("");
              setSaved("");
            }}
          >
            <option value="">Vælg udvalg</option>
            {committees.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </label>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".docx,.pdf,.jpg,.jpeg,.png"
          onChange={(event) => {
            void readFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <Button
          className={primary}
          disabled={!committee || Boolean(busy)}
          onClick={() => input.current?.click()}
        >
          {busy === "read" ? "Bestie læser …" : "Vælg filer"}
        </Button>
        <p className="w-full text-sm text-muted">
          {fileNames.length
            ? fileNames.join(" · ")
            : "Op til 4 filer til samme møde · Word (.docx), PDF, JPG eller PNG · Højst 4 MB tilsammen"}
        </p>
      </section>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="panel p-3">
          Det historiske møde er gemt.{" "}
          <Link
            className="font-medium text-brand underline"
            href={`${root}/committees/${committee}/meetings/${saved}`}
          >
            Åbn mødet
          </Link>
        </p>
      ) : null}

      {preview && proposal && !saved ? (
        <form
          className="space-y-3"
          onSubmit={(event) => event.preventDefault()}
        >
          <section className="panel grid gap-2 p-3 sm:grid-cols-2">
            <h2 className="font-semibold sm:col-span-2">Afholdt møde</h2>
            <label className="text-sm">
              <span className="label">Mødetitel</span>
              <Input
                value={proposal.title}
                required
                maxLength={160}
                onChange={(event) =>
                  setProposal({ ...proposal, title: event.target.value })
                }
              />
            </label>
            <label className="text-sm">
              <span className="label">Sted</span>
              <Input
                value={proposal.location}
                maxLength={240}
                onChange={(event) =>
                  setProposal({ ...proposal, location: event.target.value })
                }
              />
            </label>
            <label className="text-sm">
              <span className="label">Dato</span>
              <Input
                type="date"
                value={proposal.date}
                required
                onChange={(event) =>
                  setProposal({ ...proposal, date: event.target.value })
                }
              />
            </label>
            <label className="text-sm">
              <span className="label">Klokkeslæt</span>
              <Input
                type="time"
                value={proposal.time}
                onChange={(event) =>
                  setProposal({ ...proposal, time: event.target.value })
                }
              />
              {!proposal.time ? (
                <span className="text-xs text-muted">
                  Tomt felt registreres som kl. 12.
                </span>
              ) : null}
            </label>
            {!proposal.date ? (
              <p className="text-sm text-danger sm:col-span-2">
                Angiv mødedato før godkendelse.
              </p>
            ) : null}
            <label className="text-sm sm:col-span-2">
              <span className="label">Samlet referat</span>
              <Textarea
                value={proposal.summary}
                rows={4}
                maxLength={8000}
                onChange={(event) =>
                  setProposal({ ...proposal, summary: event.target.value })
                }
              />
            </label>
          </section>
          {preview.questions.length ? (
            <section className="panel space-y-1 p-3">
              <h2 className="font-semibold">Til afklaring</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {preview.questions.map(({ text, source }, index) => (
                  <li key={index}>
                    {text}{" "}
                    <span className="text-muted">· {showSource(source)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="panel p-3">
            <h2 className="font-semibold">
              Dagsorden ({proposal.items.length})
            </h2>
            {proposal.items.map((point, index) => (
              <details key={index} className="mt-2 border-t border-line pt-2">
                <summary className="cursor-pointer text-sm font-medium">
                  {point.title || "Uden titel"}{" "}
                  <span className="text-xs text-muted">
                    · {point.decisions.length} beslutninger ·{" "}
                    {point.tasks.length} opfølgninger
                  </span>
                </summary>
                <div className="space-y-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted">
                      {showSource(preview.items[index].source)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setPreview({
                          ...preview,
                          items: preview.items.filter(
                            (_, position) => position !== index,
                          ),
                        });
                        setProposal({
                          ...proposal,
                          items: proposal.items.filter(
                            (_, position) => position !== index,
                          ),
                        });
                      }}
                    >
                      Fjern dagsordenspunkt
                    </Button>
                  </div>
                  <label className="block text-sm">
                    <span className="label">Punktets titel</span>
                    <Input
                      value={point.title}
                      maxLength={200}
                      onChange={(event) =>
                        changePoint(index, { title: event.target.value })
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="label">Referatnoter</span>
                    <Textarea
                      value={point.notes}
                      rows={3}
                      maxLength={6000}
                      onChange={(event) =>
                        changePoint(index, { notes: event.target.value })
                      }
                    />
                  </label>
                  {point.decisions.map((entry, position) => (
                    <Entry
                      key={position}
                      label="Beslutning"
                      entry={entry}
                      onChange={(patch) =>
                        changePoint(index, {
                          decisions: updateEntry(
                            point.decisions,
                            position,
                            patch,
                          ),
                        })
                      }
                      onRemove={() =>
                        changePoint(index, {
                          decisions: point.decisions.filter(
                            (_, i) => i !== position,
                          ),
                        })
                      }
                    />
                  ))}
                  {point.tasks.map((entry, position) => {
                    const changeTask = (patch: Partial<typeof entry>) =>
                      changePoint(index, {
                        tasks: updateEntry(point.tasks, position, patch),
                      });
                    return (
                      <Entry
                        key={position}
                        label="Opfølgning"
                        entry={entry}
                        onChange={changeTask}
                        onRemove={() =>
                          changePoint(index, {
                            tasks: point.tasks.filter((_, i) => i !== position),
                          })
                        }
                      >
                        <div className="grid gap-2 sm:grid-cols-3">
                          <label>
                            <span className="label">Frist</span>
                            <Input
                              type="date"
                              value={entry.deadline}
                              onChange={(event) =>
                                changeTask({ deadline: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            <span className="label">
                              Ansvarlig ifølge kilden
                            </span>
                            <Input
                              value={entry.namedOwner}
                              onChange={(event) =>
                                changeTask({ namedOwner: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            <span className="label">Tildel medlem</span>
                            <Select
                              value={entry.responsibleUserId}
                              onChange={(event) =>
                                changeTask({
                                  responsibleUserId: event.target.value,
                                })
                              }
                            >
                              <option value="">Ingen tildelt</option>
                              {availableMembers.map(({ id, name }) => (
                                <option key={id} value={id}>
                                  {name}
                                </option>
                              ))}
                            </Select>
                          </label>
                        </div>
                      </Entry>
                    );
                  })}
                </div>
              </details>
            ))}
          </section>
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface p-2">
            <span className="text-sm text-muted">
              Referatet gemmes som kladde.
            </span>
            <Button
              type="button"
              className={primary}
              disabled={
                Boolean(busy) || !proposal.title.trim() || !proposal.date
              }
              onClick={async () => {
                const result = await request(proposal, "save");
                if (result) setSaved(result.meetingId);
              }}
            >
              {busy === "save" ? "Gemmer …" : "Godkend og gem møde"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Entry({
  label,
  entry,
  onChange,
  onRemove,
  children,
}: {
  label: string;
  entry: Action;
  onChange: (patch: Partial<Action>) => void;
  onRemove: () => void;
  children?: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-2 rounded-md border border-line p-2 text-sm">
      <legend className="font-medium">{label}</legend>
      <label className="block">
        <span className="label">Titel</span>
        <Input
          value={entry.title}
          maxLength={240}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </label>
      <label className="block">
        <span className="label">Detaljer</span>
        <Textarea
          value={entry.details}
          maxLength={2000}
          rows={2}
          onChange={(event) => onChange({ details: event.target.value })}
        />
      </label>
      {children}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={entry.completed}
            onChange={(event) => onChange({ completed: event.target.checked })}
          />{" "}
          Udført ifølge kilden
        </label>
        <Button type="button" size="sm" variant="secondary" onClick={onRemove}>
          Fjern forslag
        </Button>
      </div>
    </fieldset>
  );
}
