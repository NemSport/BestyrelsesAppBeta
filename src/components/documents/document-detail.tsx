"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppIcon } from "@/components/icons/app-icon";
import {
  Breadcrumbs,
  Button,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import type {
  DocumentDetail as DocumentDetailData,
  DocumentRegisterData,
} from "@/types/documents";

const dateTime = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});
const relationLabels = {
  organization: "Organisation",
  committee: "Udvalg",
  meeting: "Møde",
  agenda_item: "Dagsordenspunkt",
  task: "Opgave",
  annual_wheel_event: "Årshjulsaktivitet",
  stakeholder: "Interessent",
  stakeholder_contract: "Interessentkontrakt",
} as const;
function size(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function supportsPreview(mime: string) {
  return (
    mime === "application/pdf" ||
    mime.startsWith("image/") ||
    mime.startsWith("text/plain")
  );
}

export function DocumentDetail({
  detail,
  categories,
  committees,
}: {
  detail: DocumentDetailData;
  categories: DocumentRegisterData["categories"];
  committees: DocumentRegisterData["committees"];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [relationOpen, setRelationOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = detail.currentVersion;
  async function mutation(url: string, options: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, options);
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "Handlingen mislykkedes.");
      router.refresh();
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Handlingen mislykkedes.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const currentUrl = current
    ? `/api/documents/${detail.id}/versions/${current.id}/download`
    : "#";
  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          {
            label: "Dokumenter",
            href: `/organizations/${detail.organization_id}/documents`,
          },
          { label: detail.name },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        {current ? (
          <>
            <a className="button-secondary" href={`${currentUrl}?download=1`}>
              <AppIcon name="download" size={15} /> Download
            </a>
            {supportsPreview(current.mime_type) ? (
              <a
                className="button-primary"
                href={currentUrl}
                rel="noreferrer"
                target="_blank"
              >
                Preview
              </a>
            ) : null}
          </>
        ) : null}
        {detail.canEdit ? (
          <>
            <Button onClick={() => setReplaceOpen(true)} variant="secondary">
              Erstat fil
            </Button>
            <Button onClick={() => setEditOpen(true)} variant="secondary">
              Rediger oplysninger
            </Button>
          </>
        ) : null}
      </div>
      <section className="grid gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div>
          <p className="page-eyebrow">Dokument</p>
          <h1 className="page-title mt-1">{detail.name}</h1>
          <p className="mt-2 text-sm text-muted">
            {detail.description || "Ingen beskrivelse."}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Filnavn</dt>
            <dd className="mt-0.5 break-all font-medium">
              {current?.file_name ?? "–"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Type og størrelse</dt>
            <dd className="mt-0.5 font-medium">
              {current
                ? `${current.mime_type.split("/").pop()?.toUpperCase()} · ${size(current.file_size)}`
                : "–"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Kategori</dt>
            <dd className="mt-0.5 font-medium">
              {detail.categoryName ?? "Ukategoriseret"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Udvalg</dt>
            <dd className="mt-0.5 font-medium">
              {detail.committeeName ?? "Organisation"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Uploadet af</dt>
            <dd className="mt-0.5 font-medium">{detail.uploaderName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Opdateret</dt>
            <dd className="mt-0.5 font-medium">
              {dateTime.format(new Date(detail.updated_at))}
            </dd>
          </div>
        </dl>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Relationer</h2>
            {detail.canEdit ? (
              <Button
                onClick={() => setRelationOpen(true)}
                size="sm"
                variant="secondary"
              >
                Tilføj relation
              </Button>
            ) : null}
          </div>
          <div className="mt-3 divide-y divide-line">
            {detail.relations.map((relation) => (
              <div
                className="flex items-center justify-between gap-3 py-2.5"
                key={relation.id}
              >
                <div>
                  <p className="text-xs text-muted">
                    {relationLabels[relation.relation_type]}
                  </p>
                  <p className="text-sm font-medium">{relation.label}</p>
                </div>
                {detail.canEdit ? (
                  <Button
                    aria-label={`Fjern relation til ${relation.label}`}
                    onClick={async () => {
                      await mutation(
                        `/api/documents/${detail.id}/relations/${relation.id}`,
                        { method: "DELETE" },
                      );
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Fjern
                  </Button>
                ) : null}
              </div>
            ))}
            {!detail.relations.length ? (
              <p className="py-3 text-sm text-muted">Ingen relationer.</p>
            ) : null}
          </div>
        </section>
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
          <h2 className="section-title">Versionshistorik</h2>
          <div className="mt-3 divide-y divide-line">
            {detail.versions.map((version) => (
              <div
                className="flex items-center justify-between gap-3 py-2.5"
                key={version.id}
              >
                <div>
                  <p className="text-sm font-semibold">
                    Version {version.version_number}
                    {version.version_number ===
                    detail.current_version_number ? (
                      <span className="ml-2 text-xs font-medium text-success">
                        Aktuel
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    {dateTime.format(new Date(version.created_at))} ·{" "}
                    {version.uploaderName}
                  </p>
                </div>
                <a
                  className="button-secondary"
                  href={`/api/documents/${detail.id}/versions/${version.id}/download?download=1`}
                >
                  Download
                </a>
              </div>
            ))}
          </div>
        </section>
      </div>
      {detail.canEdit ? (
        <div className="flex justify-end">
          <Button
            variant="danger"
            onClick={async () => {
              if (
                !window.confirm(
                  `Dokumentet bruges ${detail.relationCount} steder. Hvis du sletter det, fjernes det fra alle relationer. Fortsæt?`,
                )
              )
                return;
              if (
                await mutation(`/api/documents/${detail.id}`, {
                  method: "DELETE",
                })
              )
                router.push(
                  `/organizations/${detail.organization_id}/documents`,
                );
            }}
          >
            Slet dokument
          </Button>
        </div>
      ) : null}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Rediger oplysninger"
      >
        <form
          action={async (form) => {
            if (
              await mutation(`/api/documents/${detail.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  name: form.get("name"),
                  description: form.get("description"),
                  categoryId: form.get("categoryId") || null,
                  committeeId: form.get("committeeId") || null,
                }),
              })
            )
              setEditOpen(false);
          }}
          className="space-y-4"
        >
          <label className="block text-sm font-medium">
            Dokumentnavn
            <Input
              className="mt-1"
              defaultValue={detail.name}
              name="name"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Beskrivelse
            <Textarea
              className="mt-1"
              defaultValue={detail.description ?? ""}
              name="description"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Kategori
              <Select
                className="mt-1"
                defaultValue={detail.category_id ?? ""}
                name="categoryId"
              >
                <option value="">Ingen</option>
                {categories
                  .filter((item) => item.is_active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </Select>
            </label>
            <label className="text-sm font-medium">
              Udvalg
              <Select
                className="mt-1"
                defaultValue={detail.primary_committee_id ?? ""}
                name="committeeId"
              >
                <option value="">Organisation</option>
                {committees.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end">
            <Button disabled={busy} type="submit">
              Gem
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={replaceOpen}
        onClose={() => setReplaceOpen(false)}
        title="Erstat fil"
        description="Den nuværende fil bevares som en skrivebeskyttet version."
      >
        <form
          action={async (form) => {
            if (
              await mutation(`/api/documents/${detail.id}/versions`, {
                method: "POST",
                body: form,
              })
            )
              setReplaceOpen(false);
          }}
          className="space-y-4"
        >
          <label className="block text-sm font-medium">
            Ny fil
            <Input className="mt-1" name="file" required type="file" />
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end">
            <Button disabled={busy} type="submit">
              Upload ny version
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={relationOpen}
        onClose={() => setRelationOpen(false)}
        title="Tilføj relation"
        description="Relationen deler dokumentet uden at kopiere filen."
      >
        <form
          action={async (form) => {
            if (
              await mutation(`/api/documents/${detail.id}/relations`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  relationType: form.get("relationType"),
                  relationId: form.get("relationId") || null,
                }),
              })
            )
              setRelationOpen(false);
          }}
          className="space-y-4"
        >
          <label className="block text-sm font-medium">
            Type
            <Select className="mt-1" name="relationType">
              <option value="organization">Organisation</option>
              <option value="committee">Udvalg</option>
              <option value="meeting">Møde</option>
              <option value="agenda_item">Dagsordenspunkt</option>
              <option value="task">Opgave</option>
              <option value="annual_wheel_event">Årshjulsaktivitet</option>
            </Select>
          </label>
          <label className="block text-sm font-medium">
            Element-ID{" "}
            <span className="font-normal text-muted">
              (ikke nødvendig for organisation)
            </span>
            <Input className="mt-1" name="relationId" />
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end">
            <Button disabled={busy} type="submit">
              Tilføj
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
