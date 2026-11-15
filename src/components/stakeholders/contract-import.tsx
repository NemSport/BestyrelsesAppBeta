"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { AppIcon } from "@/components/icons/app-icon";
import { Button, Input, PageHeader, Select } from "@/components/ui";
import {
  sponsorContractFields,
  sponsorContractTermNotes,
  type ContractField,
  type ContractPreview,
} from "@/lib/sponsor-contract-import";

const sections: { title: string; keys: ContractField[] }[] = [
  {
    title: "Sponsoroplysninger",
    keys: [
      "name",
      "cvr",
      "contact",
      "email",
      "phone",
      "address",
      "postalCode",
      "city",
    ],
  },
  {
    title: "Kontraktvilkår",
    keys: [
      "title",
      "startDate",
      "endDate",
      "total",
      "annual",
      "currency",
      "noticeDeadline",
      "renewalDeadline",
    ],
  },
];
const required = new Set<ContractField>(["title", "startDate", "currency"]);
const dates = new Set<ContractField>([
  "startDate",
  "endDate",
  "noticeDeadline",
  "renewalDeadline",
]);
const primary = "!bg-blue-700 !text-white hover:!bg-blue-800";

export function ContractImport({ organizationId }: { organizationId: string }) {
  const root = `/organizations/${organizationId}/stakeholders`;
  const endpoint = `/api${root}/contract-import`;
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ContractPreview | null>(null);
  const [fields, setFields] = useState({} as Record<ContractField, string>);
  const [sponsor, setSponsor] = useState("");
  const [renew, setRenew] = useState(false);
  const [benefits, setBenefits] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const missing = preview
    ? [
        ...(!sponsor ? ["Vælg sponsor"] : []),
        ...(!fields.name && sponsor === "new" ? ["Firmanavn"] : []),
        ...[...required]
          .filter((key) => !fields[key])
          .map((key) => sponsorContractFields[key]),
      ]
    : [];

  async function request(body: BodyInit, json = false) {
    const response = await fetch(endpoint, {
      method: "POST",
      body,
      headers: json ? { "Content-Type": "application/json" } : undefined,
    });
    const result = await response.json();
    if (!response.ok) {
      const problems = result.validationErrors
        ?.map(({ message }: { message: string }) => message)
        .join(" ");
      throw new Error(
        problems || result.error || "Kontraktimporten kunne ikke gennemføres.",
      );
    }
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
          : "Kontraktimporten kunne ikke gennemføres.",
      );
    } finally {
      setBusy(false);
    }
  }

  function approve(event: FormEvent) {
    event.preventDefault();
    if (!preview || busy || missing.length) return;
    void run(async () => {
      const result: string = await request(
        JSON.stringify({
          analysisId: preview.analysisId,
          sponsorId: sponsor === "new" ? null : sponsor,
          fields,
          autoRenew: renew,
          deliverables: benefits
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
        true,
      );
      setSaved(result);
    });
  }
  return (
    <div className="space-y-3">
      <Link
        href={root}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm text-brand"
      >
        <AppIcon name="arrowLeft" size={16} /> Til interessentregistret
      </Link>
      <PageHeader title="Importér sponsorkontrakt" className="!pb-2" />
      <div className="panel flex flex-wrap items-center gap-3 p-3">
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,application/pdf"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file || busy) return;
            void run(async () => {
              if (file.size > 4_000_000)
                throw new Error("Vælg en PDF på højst 4 MB.");
              const form = new FormData();
              form.set("file", file);
              const result: ContractPreview = await request(form);
              setPreview(result);
              setFields(
                Object.fromEntries(
                  Object.entries(result.fields).map(([key, item]) => [
                    key,
                    item.value ?? "",
                  ]),
                ) as Record<ContractField, string>,
              );
              setSponsor(result.suggestedId ?? "");
              setRenew(result.autoRenew ?? false);
              setBenefits(
                result.deliverables.map(({ title }) => title).join("\n"),
              );
              setFileName(file.name);
              setSaved("");
            });
          }}
        />
        <Button
          disabled={busy}
          className={primary}
          onClick={() => fileInput.current?.click()}
        >
          <AppIcon name="upload" size={17} />{" "}
          {preview ? "Vælg en anden PDF" : "Vælg PDF-kontrakt"}
        </Button>
        <span className="break-all text-sm text-muted">
          {fileName || "PDF på højst 4 MB. Bestie læser filen med AI."}
        </span>
        {busy ? (
          <span role="status" className="text-sm text-muted">
            Arbejder …
          </span>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md bg-danger-soft p-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      {saved ? (
        <div role="status" className="panel p-4">
          <p>Kontrakten er gemt som kladde.</p>
          <Link className="text-brand underline" href={`${root}/${saved}`}>
            Åbn sponsorprofilen
          </Link>
        </div>
      ) : null}
      {preview && !saved ? (
        <form onSubmit={approve} className="space-y-3">
          <section className="panel space-y-2 p-3">
            <h2 className="font-semibold">Sponsormatch</h2>
            <p className="text-sm text-muted">
              {preview.suggestedId
                ? "Bestie har foreslået et match. Kontrollér det før godkendelse."
                : preview.reviewMatch
                  ? "Tjek forslagene, og vælg den rigtige sponsor."
                  : "Bestie fandt ingen sikker sponsor i registret."}
            </p>
            <Select
              aria-label="Vælg sponsor"
              value={sponsor}
              disabled={busy}
              onChange={(event) => setSponsor(event.target.value)}
            >
              <option value="">Vælg sponsor</option>
              {preview.matchingIds.length ? (
                <optgroup label="Mulige match">
                  {preview.sponsors
                    .filter(({ id }) => preview.matchingIds.includes(id))
                    .map(({ id, name, cvr }) => (
                      <option key={id} value={id}>
                        {name}
                        {cvr ? ` · CVR ${cvr}` : ""}
                      </option>
                    ))}
                </optgroup>
              ) : null}
              <optgroup label="Øvrige interessenter">
                {preview.sponsors
                  .filter(({ id }) => !preview.matchingIds.includes(id))
                  .map(({ id, name, cvr }) => (
                    <option key={id} value={id}>
                      {name}
                      {cvr ? ` · CVR ${cvr}` : ""}
                    </option>
                  ))}
              </optgroup>
              <option value="new">Opret ny sponsor</option>
            </Select>
            {sponsor && sponsor !== "new" ? (
              <p className="text-sm text-muted">
                Tomme sponsoroplysninger suppleres. Eksisterende værdier
                bevares.
              </p>
            ) : null}
            {preview.sponsors.find(({ id }) => id === sponsor)?.conflicts
              .length ? (
              <p className="text-sm text-muted">
                Afviger fra registret i PDF’en:{" "}
                {preview.sponsors
                  .find(({ id }) => id === sponsor)
                  ?.conflicts.join(", ")}
                .
              </p>
            ) : null}
            {missing.length ? (
              <p className="text-sm font-medium text-danger">
                Mangler før godkendelse · {missing.join(", ")}
              </p>
            ) : null}
          </section>
          <div className="grid items-start gap-3 lg:grid-cols-2">
            {sections.map((section) => (
              <section className="panel space-y-2 p-3" key={section.title}>
                <h2 className="font-semibold">{section.title}</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {section.keys.map((key) => (
                    <label key={key} className="min-w-0 space-y-1 text-sm">
                      <span className="font-medium">
                        {sponsorContractFields[key]}
                      </span>
                      <Input
                        type={dates.has(key) ? "date" : "text"}
                        value={fields[key]}
                        maxLength={240}
                        disabled={busy}
                        onChange={(event) =>
                          setFields((previous) => ({
                            ...previous,
                            [key]: event.target.value,
                          }))
                        }
                      />
                      <span className="block text-xs text-muted">
                        {preview.fields[key].page
                          ? `Side ${preview.fields[key].page}`
                          : preview.fields[key].value
                            ? "Uden sidehenvisning"
                            : "Ikke fundet i PDF"}
                      </span>
                    </label>
                  ))}
                </div>
                {section.title === "Kontraktvilkår" ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={renew}
                      onChange={(event) => setRenew(event.target.checked)}
                      disabled={busy}
                    />{" "}
                    Automatisk fornyelse{" "}
                    {preview.autoRenew === null ? "· Ikke fundet i PDF" : ""}
                  </label>
                ) : null}
              </section>
            ))}
          </div>
          <section className="panel space-y-2 p-3">
            <h2 className="font-semibold">Betalingsvilkår</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {sponsorContractTermNotes.map((key) => (
                <label key={key} className="min-w-0 space-y-1 text-sm">
                  <span className="font-medium">
                    {sponsorContractFields[key]}
                  </span>
                  <textarea
                    value={fields[key] ?? ""}
                    rows={2}
                    maxLength={240}
                    disabled={busy}
                    className="field block w-full"
                    onChange={(event) =>
                      setFields((previous) => ({
                        ...previous,
                        [key]: event.target.value,
                      }))
                    }
                  />
                  <span className="block text-xs text-muted">
                    {preview.fields[key]?.page
                      ? `Side ${preview.fields[key].page}`
                      : preview.fields[key]?.value
                        ? "Uden sidehenvisning"
                        : "Ikke fundet i PDF"}
                  </span>
                </label>
              ))}
            </div>
          </section>
          <section className="panel space-y-2 p-3">
            <h2 className="font-semibold">Aftalte ydelser</h2>
            <label className="block text-sm text-muted">
              Én ydelse pr. linje
              <textarea
                value={benefits}
                onChange={(event) => setBenefits(event.target.value)}
                rows={3}
                disabled={busy}
                className="field mt-1 block w-full"
              />
            </label>
            {preview.deliverables.length ? (
              <ul className="text-xs text-muted">
                {preview.deliverables.map(({ title, page }, index) => (
                  <li key={index}>
                    {title}
                    {page ? ` · side ${page}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Bestie fandt ingen ydelser.</p>
            )}
          </section>
          <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 rounded-md border border-line bg-surface p-2">
            <span className="text-sm text-muted">Gemmes som kladde</span>
            <Button
              type="submit"
              className={primary}
              disabled={busy || Boolean(missing.length)}
            >
              Godkend og gem kladde
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
