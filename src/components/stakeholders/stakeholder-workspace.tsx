"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { AppIcon, type AppIconName } from "@/components/icons/app-icon";
import {
  ActionMenu,
  Button,
  EmptyState,
  FieldError,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { useMutationFeedback } from "@/hooks/use-mutation-feedback";
import {
  MutationRequestError,
  readMutationResponse,
} from "@/lib/mutation-feedback";
import {
  filterStakeholders,
  formatStakeholderCurrency,
  stakeholderPipelineStageLabels,
  stakeholderPipelineStages,
  stakeholderStatusLabels,
  stakeholderTypeLabels,
} from "@/lib/stakeholders";
import type {
  StakeholderPipelineEntry,
  StakeholderPipelineStage,
  StakeholderWorkspaceData,
} from "@/types/stakeholders";

function formatDate(value: string | null) {
  if (!value) return "–";
  const date =
    value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(date);
}

function statusTone(status: string) {
  if (status === "active" || status === "won") return "success" as const;
  if (status === "lead" || status === "dialogue" || status === "proposal_sent")
    return "progress" as const;
  if (status === "ended" || status === "lost") return "neutral" as const;
  return "warning" as const;
}

export function StakeholderWorkspace({
  organizationId,
  data,
}: {
  organizationId: string;
  data: StakeholderWorkspaceData;
}) {
  const router = useRouter();
  const mutation = useMutationFeedback();
  const [createOpen, setCreateOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createType, setCreateType] = useState("sponsor");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [contract, setContract] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [sort, setSort] = useState("name");
  const [error, setError] = useState<string | null>(null);
  const activeFilterCount =
    [type, status, ownerId, contract, followUp].filter(Boolean).length +
    (sort === "name" ? 0 : 1);

  const visible = useMemo(() => {
    const filtered = filterStakeholders(data.stakeholders, {
      search,
      type,
      status,
      ownerId,
      contract,
      followUp,
    });
    return [...filtered].sort((left, right) => {
      if (sort === "value")
        return right.activeAnnualValue - left.activeAnnualValue;
      if (sort === "action")
        return (left.nextActionAt ?? "9999").localeCompare(
          right.nextActionAt ?? "9999",
        );
      return left.name.localeCompare(right.name, "da-DK");
    });
  }, [
    contract,
    data.stakeholders,
    followUp,
    ownerId,
    search,
    sort,
    status,
    type,
  ]);

  async function createStakeholder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mutation.begin("Interessenten oprettes...")) return;
    setFieldErrors({});
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const stakeholder = await readMutationResponse<{ id: string }>(
        await fetch(`/api/organizations/${organizationId}/stakeholders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.get("name"),
            stakeholderType: form.get("stakeholderType"),
            relationshipStatus: form.get("relationshipStatus"),
            internalOwnerUserId:
              String(form.get("internalOwnerUserId") || "") || null,
            website: String(form.get("website") || "") || null,
            email: String(form.get("email") || "") || null,
            phone: String(form.get("phone") || "") || null,
            cvrNumber: String(form.get("cvrNumber") || "") || null,
            notes: String(form.get("notes") || "") || null,
            addToPipeline: form.get("addToPipeline") === "on",
            pipelineStage: "lead",
          }),
        }),
        "Interessenten kunne ikke oprettes.",
      );
      mutation.succeed("Interessenten er oprettet.");
      setCreateOpen(false);
      router.push(
        `/organizations/${organizationId}/stakeholders/${stakeholder.id}`,
      );
      router.refresh();
    } catch (caught) {
      if (caught instanceof MutationRequestError)
        setFieldErrors(caught.fieldErrors);
      const message =
        caught instanceof Error
          ? caught.message
          : "Interessenten kunne ikke oprettes.";
      mutation.fail(message);
      setError(message);
    }
  }

  async function movePipeline(
    entry: StakeholderPipelineEntry,
    stage: StakeholderPipelineStage,
  ) {
    if (stage === entry.stage) return;
    const lostReason =
      stage === "lost"
        ? window.prompt("Hvorfor blev sponsorleadet tabt?")
        : null;
    if (stage === "lost" && !lostReason?.trim()) return;
    setError(null);
    try {
      await readMutationResponse(
        await fetch(
          `/api/stakeholders/${entry.stakeholder_id}/pipeline/${entry.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ organizationId, stage, lostReason }),
          },
        ),
        "Pipeline-fasen kunne ikke ændres.",
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Pipeline-fasen kunne ikke ændres.",
      );
    }
  }

  async function archiveStakeholder(stakeholderId: string) {
    if (
      !window.confirm(
        "Arkivér interessenten? Historik, dokumentrelationer og opgaver bevares.",
      )
    )
      return;
    try {
      await readMutationResponse(
        await fetch(`/api/stakeholders/${stakeholderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, action: "archive" }),
        }),
        "Interessenten kunne ikke arkiveres.",
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Interessenten kunne ikke arkiveres.",
      );
    }
  }

  const kpis: Array<[string, string | number, AppIconName]> = [
    ["Aktive sponsorer", data.kpis.activeSponsors, "organization" as const],
    [
      "Årlig kontraktværdi",
      formatStakeholderCurrency(data.kpis.annualContractValue),
      "decisions" as const,
    ],
    ["Udløber snart", data.kpis.expiringSoon, "calendar" as const],
    ["Skal kontaktes", data.kpis.contactDue, "actions" as const],
    ["Leads i pipeline", data.kpis.activeLeads, "progress" as const],
    ["Manglende opfølgning", data.kpis.missingFollowUp, "pending" as const],
  ];

  function resetFilters() {
    setSearch("");
    setType("");
    setStatus("");
    setOwnerId("");
    setContract("");
    setFollowUp("");
    setSort("name");
  }

  function advancedFilters(showLabels: boolean) {
    const labelClassName = showLabels ? "label" : "sr-only";
    return (
      <>
        <label>
          <span className={labelClassName}>Type</span>
          <Select
            aria-label="Type"
            onChange={(event) => setType(event.target.value)}
            value={type}
          >
            <option value="">Alle typer</option>
            {Object.entries(stakeholderTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className={labelClassName}>Relationsstatus</span>
          <Select
            aria-label="Relationsstatus"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="">Alle statusser</option>
            {Object.entries(stakeholderStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className={labelClassName}>Intern ansvarlig</span>
          <Select
            aria-label="Intern ansvarlig"
            onChange={(event) => setOwnerId(event.target.value)}
            value={ownerId}
          >
            <option value="">Alle ansvarlige</option>
            {data.members
              .filter((member) => member.status === "active")
              .map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.full_name || member.email}
                </option>
              ))}
          </Select>
        </label>
        <label>
          <span className={labelClassName}>Kontrakt</span>
          <Select
            aria-label="Kontrakt"
            onChange={(event) => setContract(event.target.value)}
            value={contract}
          >
            <option value="">Alle kontrakter</option>
            <option value="active">Aktiv kontrakt</option>
            <option value="expiring">Udløber snart</option>
            <option value="none">Uden aktiv kontrakt</option>
          </Select>
        </label>
        <label>
          <span className={labelClassName}>Opfølgning</span>
          <Select
            aria-label="Opfølgning"
            onChange={(event) => setFollowUp(event.target.value)}
            value={followUp}
          >
            <option value="">Al opfølgning</option>
            <option value="required">Kræver opfølgning</option>
            <option value="overdue">Forfalden</option>
            <option value="none">Ingen næste handling</option>
          </Select>
        </label>
      </>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <section
        aria-label="Interessentstatus"
        className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6"
      >
        {kpis.map(([label, value, icon]) => (
          <div
            className="flex h-full min-w-0 flex-col rounded-[var(--radius-panel)] border border-line bg-surface p-2.5 sm:p-3"
            key={String(label)}
          >
            <span className="inline-flex size-7 items-center justify-center rounded-[var(--radius-control)] bg-brand-soft text-brand sm:size-8">
              <AppIcon name={icon} size={16} />
            </span>
            <p className="mt-2 break-words text-lg font-semibold tabular-nums text-ink sm:mt-3 sm:text-xl">
              {value}
            </p>
            <p className="mt-0.5 text-xs font-medium leading-4 text-muted sm:mt-1">
              {label}
            </p>
          </div>
        ))}
      </section>

      {error ? (
        <p
          className="rounded-[var(--radius-control)] border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section aria-labelledby="stakeholder-register-heading">
        <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="page-eyebrow text-muted">Relationsarbejde</p>
            <h2
              className="section-title mt-1"
              id="stakeholder-register-heading"
            >
              Interessentregister
            </h2>
          </div>
          {data.capabilities.createStakeholders ? (
            <Button
              className="w-full sm:w-auto"
              onClick={() => setCreateOpen(true)}
            >
              <AppIcon name="taskAdd" size={16} /> Ny interessent
            </Button>
          ) : null}
        </div>
        <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-2">
          <div className="flex min-w-0 items-center gap-2 sm:hidden">
            <Input
              aria-label="Søg interessenter"
              className="min-w-0 flex-1"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Søg navn, CVR eller kontakt"
              type="search"
              value={search}
            />
            <Button
              aria-label={`Åbn filtre${activeFilterCount ? `, ${activeFilterCount} aktive` : ""}`}
              className="shrink-0"
              onClick={() => setFiltersOpen(true)}
              size="sm"
              variant="secondary"
            >
              <AppIcon name="filter" size={16} /> Filtre
              {activeFilterCount ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-xs leading-none text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </div>
          <div className="hidden gap-2 sm:grid sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1.5fr)_repeat(5,minmax(8rem,.7fr))]">
            <label>
              <span className="sr-only">Søg interessenter</span>
              <Input
                aria-label="Søg interessenter"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Søg navn, CVR eller kontakt"
                type="search"
                value={search}
              />
            </label>
            {advancedFilters(false)}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs text-muted">
            <span>
              {visible.length} af {data.stakeholders.length} interessenter
            </span>
            <Select
              aria-label="Sortering"
              className="hidden max-w-48 sm:block"
              onChange={(event) => setSort(event.target.value)}
              value={sort}
            >
              <option value="name">Navn A–Z</option>
              <option value="value">Højeste årsværdi</option>
              <option value="action">Næste handling</option>
            </Select>
          </div>
        </div>

        <div className="mt-3 overflow-visible rounded-[var(--radius-panel)] border border-line bg-surface">
          {visible.length ? (
            <div role="list">
              <div className="hidden grid-cols-[minmax(14rem,1.5fr)_7rem_7rem_minmax(8rem,.8fr)_9rem_minmax(9rem,1fr)_auto] gap-3 border-b border-line bg-subtle px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted md:grid">
                <span>Navn</span>
                <span>Type</span>
                <span>Status</span>
                <span>Ansvarlig</span>
                <span>Årlig værdi</span>
                <span>Næste handling</span>
                <span />
              </div>
              {visible.map((item) => (
                <article
                  className="relative grid gap-1.5 border-b border-line px-3 py-2.5 last:border-0 md:grid-cols-[minmax(14rem,1.5fr)_7rem_7rem_minmax(8rem,.8fr)_9rem_minmax(9rem,1fr)_auto] md:items-center md:gap-3 md:px-4 md:py-3"
                  key={item.id}
                  role="listitem"
                >
                  <div className="min-w-0 pr-11 md:pr-0">
                    <Link
                      className="block truncate font-semibold text-ink hover:text-brand"
                      href={`/organizations/${organizationId}/stakeholders/${item.id}`}
                    >
                      {item.name}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {item.primaryContact?.name ??
                        item.email ??
                        "Ingen kontaktperson"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 md:hidden">
                    <StatusBadge>
                      {stakeholderTypeLabels[item.stakeholder_type]}
                    </StatusBadge>
                    <StatusBadge tone={statusTone(item.relationship_status)}>
                      {stakeholderStatusLabels[item.relationship_status]}
                    </StatusBadge>
                  </div>
                  <StatusBadge className="hidden md:inline-flex">
                    {stakeholderTypeLabels[item.stakeholder_type]}
                  </StatusBadge>
                  <StatusBadge
                    className="hidden md:inline-flex"
                    tone={statusTone(item.relationship_status)}
                  >
                    {stakeholderStatusLabels[item.relationship_status]}
                  </StatusBadge>
                  <div className="grid min-w-0 grid-cols-2 gap-3 text-sm md:hidden">
                    <span className="min-w-0 truncate text-muted">
                      {item.ownerName ?? "Ikke tildelt"}
                    </span>
                    <span className="text-right font-semibold tabular-nums">
                      {formatStakeholderCurrency(item.activeAnnualValue)}
                    </span>
                  </div>
                  <span className="hidden truncate text-sm text-muted md:block">
                    {item.ownerName ?? "Ikke tildelt"}
                  </span>
                  <span className="hidden text-sm font-semibold tabular-nums md:block">
                    {formatStakeholderCurrency(item.activeAnnualValue)}
                  </span>
                  <span
                    className={
                      item.overdueFollowUp
                        ? "break-words text-sm font-medium text-danger"
                        : "break-words text-sm text-muted"
                    }
                  >
                    {item.nextActionLabel
                      ? `${item.nextActionLabel} · ${formatDate(item.nextActionAt)}`
                      : "Ingen næste handling"}
                  </span>
                  <ActionMenu
                    ariaLabel={`Handlinger for ${item.name}`}
                    className="absolute right-2 top-1.5 md:static"
                    label={<AppIcon name="more" size={17} />}
                    showChevron={false}
                    triggerClassName="size-11 min-h-11 px-0 md:size-10 md:min-h-10"
                  >
                    <Link
                      className="block rounded px-3 py-2 text-sm hover:bg-subtle"
                      href={`/organizations/${organizationId}/stakeholders/${item.id}`}
                    >
                      Åbn profil
                    </Link>
                    {data.capabilities.archiveStakeholders ? (
                      <button
                        className="block w-full rounded px-3 py-2 text-left text-sm text-danger hover:bg-subtle"
                        onClick={() => archiveStakeholder(item.id)}
                        type="button"
                      >
                        Arkivér
                      </button>
                    ) : null}
                  </ActionMenu>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              action={
                data.capabilities.createStakeholders &&
                !data.stakeholders.length ? (
                  <Button onClick={() => setCreateOpen(true)}>
                    Opret interessent
                  </Button>
                ) : undefined
              }
              description={
                data.stakeholders.length
                  ? "Juster filtrene for at se flere relationer."
                  : "Saml sponsorer, leverandører og samarbejdspartnere ét sted."
              }
              kind={
                data.stakeholders.length
                  ? "filtered"
                  : data.capabilities.createStakeholders
                    ? "empty"
                    : "read-only"
              }
              title={
                data.stakeholders.length
                  ? "Ingen interessenter matcher"
                  : "Der er ingen interessenter endnu"
              }
            />
          )}
        </div>
      </section>

      <section aria-labelledby="pipeline-heading">
        <div className="mb-3">
          <p className="page-eyebrow text-muted">Sponsorarbejde</p>
          <h2 className="section-title mt-1" id="pipeline-heading">
            Sponsor-pipeline
          </h2>
        </div>
        {data.pipeline.length ? (
          <div className="grid gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            {stakeholderPipelineStages.map((stage) => {
              const cards = data.pipeline.filter(
                (entry) => entry.stage === stage,
              );
              return (
                <section
                  className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-subtle/35"
                  key={stage}
                >
                  <header className="flex items-center justify-between border-b border-line px-3 py-2">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink">
                      {stakeholderPipelineStageLabels[stage]}
                    </h3>
                    <StatusBadge tone={statusTone(stage)}>
                      {cards.length}
                    </StatusBadge>
                  </header>
                  <div className="space-y-2 p-2">
                    {cards.length ? (
                      cards.map((entry) => (
                        <article
                          className="rounded-[var(--radius-control)] border border-line bg-surface p-2.5 sm:p-3"
                          key={entry.id}
                        >
                          <Link
                            className="font-semibold text-ink hover:text-brand"
                            href={`/organizations/${organizationId}/stakeholders/${entry.stakeholder_id}`}
                          >
                            {entry.stakeholder.name}
                          </Link>
                          <p className="mt-1 text-xs text-muted">
                            {entry.ownerName ?? "Ingen ansvarlig"}
                          </p>
                          {entry.estimated_value !== null ? (
                            <p className="mt-2 text-sm font-semibold">
                              {formatStakeholderCurrency(
                                Number(entry.estimated_value),
                                entry.currency,
                              )}
                            </p>
                          ) : null}
                          {entry.next_follow_up_at ? (
                            <p
                              className={
                                new Date(entry.next_follow_up_at) < new Date()
                                  ? "mt-2 text-xs font-medium text-danger"
                                  : "mt-2 text-xs text-muted"
                              }
                            >
                              Opfølgning {formatDate(entry.next_follow_up_at)}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs text-warning">
                              Ingen næste opfølgning
                            </p>
                          )}
                          {data.capabilities.managePipeline ? (
                            <Select
                              aria-label={`Flyt ${entry.stakeholder.name}`}
                              className="mt-2.5"
                              onChange={(event) =>
                                void movePipeline(
                                  entry,
                                  event.target
                                    .value as StakeholderPipelineStage,
                                )
                              }
                              value={entry.stage}
                            >
                              {stakeholderPipelineStages.map((value) => (
                                <option key={value} value={value}>
                                  {stakeholderPipelineStageLabels[value]}
                                </option>
                              ))}
                            </Select>
                          ) : null}
                        </article>
                      ))
                    ) : (
                      <p className="px-2 py-1.5 text-xs text-muted">
                        Ingen i denne fase.
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <EmptyState
            compact
            description="Tilføj en sponsor til pipelinen fra oprettelsen eller stakeholderprofilen."
            title="Der er ingen aktive sponsorleads."
          />
        )}
      </section>

      <section aria-labelledby="upcoming-stakeholder-actions">
        <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4">
          <h2 className="section-title" id="upcoming-stakeholder-actions">
            Kommende handlinger og deadlines
          </h2>
          <div className="mt-3 divide-y divide-line">
            {data.upcomingActions.length ? (
              data.upcomingActions.map((action) => (
                <Link
                  className="flex flex-col items-start gap-1 py-2.5 text-sm hover:text-brand sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-3"
                  href={action.href}
                  key={`${action.id}-${action.date}`}
                >
                  <span className="min-w-0 break-words font-medium">
                    {action.title}
                  </span>
                  <span
                    className={
                      action.overdue
                        ? "shrink-0 text-danger"
                        : "shrink-0 text-muted"
                    }
                  >
                    {formatDate(action.date)}
                  </span>
                </Link>
              ))
            ) : (
              <p className="py-4 text-sm text-muted">
                Ingen kommende handlinger.
              </p>
            )}
          </div>
        </div>
      </section>

      <Modal
        description={`${visible.length} af ${data.stakeholders.length} interessenter vises med de aktuelle filtre.`}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button onClick={resetFilters} variant="ghost">
              Nulstil
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>
              Vis {visible.length} resultater
            </Button>
          </div>
        }
        maxWidth="lg"
        onClose={() => setFiltersOpen(false)}
        open={filtersOpen}
        placement="right"
        title="Filtrer interessenter"
      >
        <div className="grid gap-4">
          {advancedFilters(true)}
          <label>
            <span className="label">Sortering</span>
            <Select
              aria-label="Sortering"
              onChange={(event) => setSort(event.target.value)}
              value={sort}
            >
              <option value="name">Navn A–Z</option>
              <option value="value">Højeste årsværdi</option>
              <option value="action">Næste handling</option>
            </Select>
          </label>
        </div>
      </Modal>

      <Modal
        description="Opret stamdata nu. Kontakter, kontrakter og aktiviteter tilføjes fra profilen."
        maxWidth="2xl"
        onClose={() => setCreateOpen(false)}
        open={createOpen}
        title="Ny interessent"
      >
        <form className="space-y-4" noValidate onSubmit={createStakeholder}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="label">Navn *</span>
              <Input
                aria-invalid={Boolean(fieldErrors.name)}
                name="name"
                required
              />
              <FieldError
                id="stakeholder-name-error"
                message={fieldErrors.name}
              />
            </label>
            <label>
              <span className="label">Type *</span>
              <Select
                name="stakeholderType"
                onChange={(event) => setCreateType(event.target.value)}
                required
                value={createType}
              >
                <option value="sponsor">Sponsor</option>
                <option value="supplier">Leverandør</option>
                <option value="partner">Samarbejdspartner</option>
                <option value="other">Anden</option>
              </Select>
            </label>
            <label>
              <span className="label">Relationsstatus</span>
              <Select name="relationshipStatus">
                <option value="lead">Lead</option>
                <option value="active">Aktiv</option>
                <option value="inactive">Inaktiv</option>
                <option value="ended">Afsluttet</option>
              </Select>
            </label>
            <label>
              <span className="label">Intern ansvarlig</span>
              <Select name="internalOwnerUserId">
                <option value="">Ingen ansvarlig</option>
                {data.members
                  .filter((member) => member.status === "active")
                  .map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name || member.email}
                    </option>
                  ))}
              </Select>
            </label>
            <label>
              <span className="label">Website</span>
              <Input name="website" type="url" />
            </label>
            <label>
              <span className="label">Primær email</span>
              <Input name="email" type="email" />
              <FieldError
                id="stakeholder-email-error"
                message={fieldErrors.email}
              />
            </label>
            <label>
              <span className="label">Telefon</span>
              <Input name="phone" type="tel" />
            </label>
            <label>
              <span className="label">CVR</span>
              <Input name="cvrNumber" />
            </label>
            <label className="sm:col-span-2">
              <span className="label">Noter</span>
              <Textarea name="notes" />
            </label>
            {createType === "sponsor" ? (
              <label className="flex min-h-11 items-center gap-2 sm:col-span-2">
                <input name="addToPipeline" type="checkbox" /> Tilføj sponsor
                til pipeline som Lead
              </label>
            ) : null}
          </div>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button
              onClick={() => setCreateOpen(false)}
              type="button"
              variant="secondary"
            >
              Annuller
            </Button>
            <Button disabled={mutation.pending} type="submit">
              {mutation.pending ? "Opretter…" : "Opret interessent"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
