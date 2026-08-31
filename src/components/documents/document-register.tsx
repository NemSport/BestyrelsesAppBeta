"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppIcon, type AppIconName } from "@/components/icons/app-icon";
import {
  ActionMenu,
  Button,
  EmptyState,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import {
  documentFileType,
  filterAndSortDocuments,
} from "@/lib/document-register";
import type { DocumentListItem, DocumentRegisterData } from "@/types/documents";

const dateFormat = new Intl.DateTimeFormat("da-DK", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("da-DK", {
  hour: "2-digit",
  minute: "2-digit",
});

function formatActivityTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return `I dag · ${timeFormat.format(date).replace(":", ".")}`;
  }
  return dateFormat.format(date);
}

function QuickAction({
  icon,
  label,
  onClick,
  href,
}: {
  icon: AppIconName;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "group flex min-h-10 w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-sm font-medium text-ink transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
  const content = (
    <>
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-subtle text-muted transition group-hover:text-brand">
        <AppIcon name={icon} size={15} />
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      <AppIcon className="text-muted" name="arrowRight" size={14} />
    </>
  );
  return href ? (
    <Link className={className} href={href}>
      {content}
    </Link>
  ) : (
    <button className={className} onClick={onClick} type="button">
      {content}
    </button>
  );
}

function DocumentKpis({ data }: { data: DocumentRegisterData }) {
  const latest = [...data.documents].sort(
    (left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at),
  )[0];
  const cards: Array<{
    label: string;
    icon: AppIconName;
    value: string;
    detail: string;
  }> = [
    {
      label: "Dokumenter",
      icon: "documents",
      value: String(data.documents.length),
      detail: "i organisationens arkiv",
    },
    {
      label: "Kategorier",
      icon: "filter",
      value: String(data.categories.filter((item) => item.is_active).length),
      detail: "aktive kategorier",
    },
    {
      label: "Seneste opdatering",
      icon: "history",
      value: latest ? dateFormat.format(new Date(latest.updated_at)) : "–",
      detail: latest?.name ?? "Ingen dokumenter endnu",
    },
    {
      label: "Relationer",
      icon: "committees",
      value: String(
        data.documents.reduce((total, item) => total + item.relationCount, 0),
      ),
      detail: "på tværs af arbejdsområder",
    },
  ];

  return (
    <section
      aria-label="Dokumentstatus"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map((card) => (
        <div
          className="flex min-h-20 items-center gap-3.5 rounded-[var(--radius-panel)] border border-line bg-surface px-4 py-3"
          key={card.label}
        >
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand-soft text-brand">
            <AppIcon name={card.icon} size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">
              {card.label}
            </p>
            <div className="mt-1 flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 text-lg font-semibold leading-none tabular-nums text-ink">
                {card.value}
              </span>
              <span className="truncate text-xs text-muted">{card.detail}</span>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

function DocumentRow({
  item,
  organizationId,
}: {
  item: DocumentListItem;
  organizationId: string;
}) {
  const detailHref = `/organizations/${organizationId}/documents/${item.id}`;
  const downloadHref = item.currentVersion
    ? `/api/documents/${item.id}/versions/${item.currentVersion.id}/download?download=1`
    : null;

  return (
    <article
      className="relative grid min-w-0 gap-2 border-b border-line/80 px-3 py-3.5 last:border-b-0 hover:bg-brand-soft/35 sm:px-4 md:grid-cols-[minmax(15rem,2.2fr)_minmax(7rem,.72fr)_minmax(8rem,.85fr)_minmax(8rem,.8fr)_auto] md:items-center md:gap-3"
      role="listitem"
    >
      <Link
        aria-label={`Åbn ${item.name}`}
        className="absolute inset-0 z-0 rounded-[var(--radius-control)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        href={detailHref}
      />
      <div className="pointer-events-none relative z-[1] min-w-0">
        <div className="flex items-start gap-2.5">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand-soft text-brand">
            <AppIcon name="documents" size={17} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-5 text-ink">
              {item.name}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {documentFileType(
                item.currentVersion?.mime_type,
                item.currentVersion?.file_name,
              )}{" "}
              · {item.relationCount}{" "}
              {item.relationCount === 1 ? "relation" : "relationer"}
            </p>
          </div>
        </div>
      </div>
      <div className="pointer-events-none relative z-[1] pl-[2.625rem] md:pl-0">
        <span className="inline-flex max-w-full truncate rounded-full border border-line bg-subtle px-2 py-1 text-[0.7rem] font-semibold text-muted">
          {item.categoryName ?? "Ukategoriseret"}
        </span>
      </div>
      <p className="pointer-events-none relative z-[1] truncate pl-[2.625rem] text-xs text-muted md:pl-0">
        {item.committeeName ?? "Organisation"}
      </p>
      <div className="pointer-events-none relative z-[1] pl-[2.625rem] text-xs text-muted md:pl-0">
        <p className="font-medium tabular-nums text-ink">
          {dateFormat.format(new Date(item.updated_at))}
        </p>
        <p className="mt-0.5 truncate">{item.uploaderName}</p>
      </div>
      <div className="relative z-10 ml-auto md:ml-0">
        <ActionMenu
          ariaLabel={`Flere handlinger for ${item.name}`}
          label={<AppIcon name="more" size={17} />}
          showChevron={false}
          triggerClassName="size-10 min-h-10 px-0"
        >
          <Link
            className="flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-ink hover:bg-subtle"
            href={detailHref}
          >
            <AppIcon name="documents" size={15} /> Åbn dokument
          </Link>
          {downloadHref ? (
            <a
              className="flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-ink hover:bg-subtle"
              href={downloadHref}
            >
              <AppIcon name="download" size={15} /> Download
            </a>
          ) : null}
        </ActionMenu>
      </div>
    </article>
  );
}

export function DocumentRegister({
  organizationId,
  data,
  initialCommitteeId = "",
  openUploadOnLoad = false,
}: {
  organizationId: string;
  data: DocumentRegisterData;
  initialCommitteeId?: string;
  openUploadOnLoad?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [committee, setCommittee] = useState(initialCommitteeId);
  const [type, setType] = useState("");
  const [year, setYear] = useState("");
  const [sort, setSort] = useState("updated");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const openedUpload = useRef(false);

  useEffect(() => {
    if (!openUploadOnLoad || openedUpload.current) return;
    openedUpload.current = true;
    setUploadOpen(true);
  }, [openUploadOnLoad]);

  const years = [
    ...new Set(
      data.documents.map((item) => new Date(item.updated_at).getFullYear()),
    ),
  ].sort((a, b) => b - a);
  const types = [
    ...new Set(
      data.documents.map((item) =>
        documentFileType(
          item.currentVersion?.mime_type,
          item.currentVersion?.file_name,
        ),
      ),
    ),
  ].sort();
  const visible = useMemo(
    () =>
      filterAndSortDocuments(data.documents, {
        search,
        category,
        committee,
        type,
        year,
        sort,
      }),
    [category, committee, data.documents, search, sort, type, year],
  );
  const recentDocuments = [...data.documents]
    .sort(
      (left, right) =>
        Date.parse(right.updated_at) - Date.parse(left.updated_at),
    )
    .slice(0, 5);
  const categoryCounts = data.categories
    .filter((item) => item.is_active)
    .map((item) => ({
      ...item,
      count: data.documents.filter(
        (document) => document.category_id === item.id,
      ).length,
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.name.localeCompare(right.name, "da"),
    )
    .slice(0, 8);
  const filtersActive = Boolean(
    search || category || committee || type || year || sort !== "updated",
  );

  function resetFilters() {
    setSearch("");
    setCategory("");
    setCommittee("");
    setType("");
    setYear("");
    setSort("updated");
  }

  async function upload(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      if (selectedFile) formData.set("file", selectedFile);
      const response = await fetch(
        `/api/organizations/${organizationId}/documents`,
        { method: "POST", body: formData },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Dokumentet kunne ikke uploades.");
      }
      setUploadOpen(false);
      setDocumentName("");
      setSelectedFile(null);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Upload mislykkedes.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createCategory(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/document-categories`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: formData.get("name") }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Kategorien kunne ikke oprettes.");
      }
      setCategoryOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Handlingen mislykkedes.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function setCategoryActive(categoryId: string, isActive: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/document-categories/${categoryId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isActive }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Kategorien kunne ikke opdateres.");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Handlingen mislykkedes.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function renameCategory(categoryId: string, formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/document-categories/${categoryId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: formData.get("name") }),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Kategorien kunne ikke omdøbes.");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Handlingen mislykkedes.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <DocumentKpis data={data} />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,3.2fr)_minmax(16rem,1fr)] xl:items-start">
        <div className="min-w-0 space-y-2.5">
          <section
            aria-label="Filtrer dokumenter"
            className="rounded-[var(--radius-panel)] border border-line bg-surface p-2"
          >
            <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center">
              <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1.45fr)_repeat(3,minmax(7.5rem,.75fr))]">
                <label>
                  <span className="sr-only">Søg dokumenter</span>
                  <Input
                    className="min-h-9 text-sm"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Søg dokument"
                    type="search"
                    value={search}
                  />
                </label>
                <label>
                  <span className="sr-only">Kategori</span>
                  <Select
                    className="min-h-9 text-sm"
                    onChange={(event) => setCategory(event.target.value)}
                    value={category}
                  >
                    <option value="">Alle kategorier</option>
                    {data.categories
                      .filter((item) => item.is_active)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </Select>
                </label>
                <label>
                  <span className="sr-only">Udvalg</span>
                  <Select
                    className="min-h-9 text-sm"
                    onChange={(event) => setCommittee(event.target.value)}
                    value={committee}
                  >
                    <option value="">Alle udvalg</option>
                    {data.committees.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  <span className="sr-only">Filtype</span>
                  <Select
                    className="min-h-9 text-sm"
                    onChange={(event) => setType(event.target.value)}
                    value={type}
                  >
                    <option value="">Alle filtyper</option>
                    {types.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </Select>
                </label>
              </div>
              <Button onClick={() => setUploadOpen(true)} size="sm">
                <AppIcon name="upload" size={16} /> Upload dokument
              </Button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-1.5">
              <label className="min-w-32">
                <span className="sr-only">År</span>
                <Select
                  className="min-h-9 py-1.5 text-xs"
                  onChange={(event) => setYear(event.target.value)}
                  value={year}
                >
                  <option value="">Alle år</option>
                  {years.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </Select>
              </label>
              <label className="min-w-44">
                <span className="sr-only">Sortering</span>
                <Select
                  className="min-h-9 py-1.5 text-xs"
                  onChange={(event) => setSort(event.target.value)}
                  value={sort}
                >
                  <option value="updated">Senest opdateret</option>
                  <option value="newest">Nyeste</option>
                  <option value="oldest">Ældste</option>
                  <option value="name-asc">Navn A–Z</option>
                  <option value="name-desc">Navn Z–A</option>
                </Select>
              </label>
              <button
                className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-xs font-semibold text-muted transition hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-45"
                disabled={!filtersActive}
                onClick={resetFilters}
                type="button"
              >
                <AppIcon name="close" size={13} /> Nulstil filtre
              </button>
              <span className="ml-auto text-xs text-muted">
                {visible.length} af {data.documents.length} dokumenter
              </span>
            </div>
          </section>

          <section className="overflow-visible rounded-[var(--radius-panel)] border border-line bg-surface">
            <div className="hidden grid-cols-[minmax(15rem,2.2fr)_minmax(7rem,.72fr)_minmax(8rem,.85fr)_minmax(8rem,.8fr)_auto] gap-3 border-b border-line bg-subtle/65 px-4 py-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted md:grid">
              <span>Dokument</span>
              <span>Kategori</span>
              <span>Udvalg / ejer</span>
              <span>Sidst opdateret</span>
              <span className="sr-only">Handlinger</span>
            </div>
            {visible.length ? (
              <div role="list">
                {visible.map((item) => (
                  <DocumentRow
                    item={item}
                    key={item.id}
                    organizationId={organizationId}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                description={
                  data.documents.length
                    ? "Juster eller nulstil filtrene for at se flere dokumenter."
                    : "Upload organisationens første dokument for at starte arkivet."
                }
                kind={data.documents.length ? "filtered" : "empty"}
                title={
                  data.documents.length
                    ? "Ingen dokumenter matcher"
                    : "Ingen dokumenter endnu"
                }
              />
            )}
          </section>
        </div>

        <aside className="grid w-full gap-3 xl:sticky xl:top-20">
          <section className="w-full rounded-[var(--radius-panel)] border border-line bg-surface p-3.5">
            <h2 className="text-sm font-semibold text-ink">
              Hurtige handlinger
            </h2>
            <div className="mt-2 space-y-0.5">
              <QuickAction
                icon="upload"
                label="Upload dokument"
                onClick={() => setUploadOpen(true)}
              />
              {data.canManageCategories ? (
                <>
                  <QuickAction
                    icon="taskAdd"
                    label="Opret ny kategori"
                    onClick={() => setCategoryOpen(true)}
                  />
                  <QuickAction
                    icon="settings"
                    label="Administrer kategorier"
                    onClick={() => setCategoryOpen(true)}
                  />
                  <QuickAction
                    href={`/organizations/${organizationId}/trash`}
                    icon="trash"
                    label="Se papirkurv"
                  />
                </>
              ) : null}
            </div>
          </section>

          <section className="w-full rounded-[var(--radius-panel)] border border-line bg-surface p-3.5">
            <div className="flex items-center gap-2">
              <AppIcon className="text-muted" name="history" size={15} />
              <h2 className="text-sm font-semibold text-ink">
                Seneste aktivitet
              </h2>
            </div>
            <div className="mt-2 divide-y divide-line/70">
              {recentDocuments.length ? (
                recentDocuments.map((item) => (
                  <Link
                    className="group flex gap-2.5 py-2.5 first:pt-1.5 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    href={`/organizations/${organizationId}/documents/${item.id}`}
                    key={item.id}
                  >
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-subtle text-muted group-hover:text-brand">
                      <AppIcon name="documents" size={14} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-ink group-hover:text-brand">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.7rem] text-muted">
                        Opdateret af {item.uploaderName}
                      </span>
                      <span className="mt-0.5 block text-[0.68rem] text-muted">
                        {formatActivityTime(item.updated_at)}
                      </span>
                    </span>
                  </Link>
                ))
              ) : (
                <p className="py-2 text-xs text-muted">
                  Ingen dokumentaktivitet endnu.
                </p>
              )}
            </div>
          </section>

          <section className="w-full rounded-[var(--radius-panel)] border border-line bg-surface p-3.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">Kategorier</h2>
              {data.canManageCategories ? (
                <button
                  className="text-xs font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  onClick={() => setCategoryOpen(true)}
                  type="button"
                >
                  Se alle
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {categoryCounts.length ? (
                categoryCounts.map((item) => (
                  <button
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-subtle px-2.5 py-1 text-xs font-medium text-muted transition hover:border-brand/35 hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    key={item.id}
                    onClick={() => setCategory(item.id)}
                    type="button"
                  >
                    {item.name}
                    <span className="font-semibold tabular-nums text-ink">
                      {item.count}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-xs text-muted">Ingen aktive kategorier.</p>
              )}
            </div>
          </section>
        </aside>
      </div>

      <Modal
        description="Filen gemmes centralt og kan relateres til flere steder senere."
        onClose={() => setUploadOpen(false)}
        open={uploadOpen}
        title="Upload dokument"
      >
        <form action={upload} className="space-y-4">
          <label
            className="block rounded-[var(--radius-control)] border border-dashed border-line bg-subtle p-5 text-center text-sm font-medium text-ink"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file) {
                setSelectedFile(file);
                if (!documentName) {
                  setDocumentName(file.name.replace(/\.[^.]+$/, ""));
                }
              }
            }}
          >
            Vælg eller slip en fil her
            <Input
              className="mt-3"
              name="file"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedFile(file);
                if (file && !documentName) {
                  setDocumentName(file.name.replace(/\.[^.]+$/, ""));
                }
              }}
              required={!selectedFile}
              type="file"
            />
            {selectedFile ? (
              <span className="mt-2 block text-xs text-muted">
                Valgt: {selectedFile.name}
              </span>
            ) : null}
          </label>
          <label className="block text-sm font-medium">
            Dokumentnavn
            <Input
              className="mt-1"
              name="name"
              onChange={(event) => setDocumentName(event.target.value)}
              required
              value={documentName}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Kategori
              <Select className="mt-1" name="categoryId">
                <option value="">Ingen kategori</option>
                {data.categories
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
                defaultValue={initialCommitteeId}
                name="committeeId"
              >
                <option value="">Organisationen</option>
                {data.committees.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <label className="block text-sm font-medium">
            Beskrivelse
            <Textarea className="mt-1" name="description" />
          </label>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => setUploadOpen(false)}
              type="button"
              variant="secondary"
            >
              Annuller
            </Button>
            <Button disabled={busy} type="submit">
              {busy ? "Uploader…" : "Upload dokument"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        onClose={() => setCategoryOpen(false)}
        open={categoryOpen}
        title="Administrer dokumentkategorier"
      >
        <div className="divide-y divide-line">
          {data.categories.map((item) => (
            <form
              action={(form) => renameCategory(item.id, form)}
              className="flex items-end gap-2 py-2"
              key={item.id}
            >
              <label className="min-w-0 flex-1 text-xs text-muted">
                {item.is_active ? "Aktiv" : "Deaktiveret"}
                {item.is_system ? " · Standardkategori" : ""}
                <Input
                  className="mt-1"
                  defaultValue={item.name}
                  name="name"
                  required
                />
              </label>
              <Button
                disabled={busy}
                size="sm"
                type="submit"
                variant="secondary"
              >
                Gem
              </Button>
              <Button
                disabled={busy}
                onClick={() => setCategoryActive(item.id, !item.is_active)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {item.is_active ? "Deaktiver" : "Aktiver"}
              </Button>
            </form>
          ))}
        </div>
        <form
          action={createCategory}
          className="mt-5 space-y-4 border-t border-line pt-4"
        >
          <label className="block text-sm font-medium">
            Ny kategori
            <Input className="mt-1" name="name" required />
          </label>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button disabled={busy} type="submit">
              Opret kategori
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
