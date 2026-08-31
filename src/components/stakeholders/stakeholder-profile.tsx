"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { AppIcon } from "@/components/icons/app-icon";
import { TaskCreateModal } from "@/components/tasks/task-create-modal";
import { TaskDetailModal } from "@/components/tasks/task-detail-modal";
import {
  ActionMenu,
  Breadcrumbs,
  Button,
  EmptyState,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { readMutationResponse } from "@/lib/mutation-feedback";
import {
  formatStakeholderCurrency,
  stakeholderActivityLabels,
  stakeholderPipelineStageLabels,
  stakeholderPipelineStages,
  stakeholderStatusLabels,
  stakeholderTypeLabels,
} from "@/lib/stakeholders";
import { taskStatusLabels } from "@/lib/tasks";
import type { TaskView } from "@/types/domain";
import type {
  StakeholderContact,
  StakeholderPipelineEntry,
  StakeholderProfileData,
} from "@/types/stakeholders";

type Dialog =
  | "edit"
  | "contact"
  | "contract"
  | "activity"
  | "deliverable"
  | "pipeline"
  | "document"
  | null;

function formatDate(value: string | null, withTime = false) {
  if (!value) return "Ikke angivet";
  const date =
    value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat(
    "da-DK",
    withTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" },
  ).format(date);
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nullable(form: FormData, key: string) {
  return String(form.get(key) || "").trim() || null;
}

function amount(form: FormData, key: string) {
  const value = String(form.get(key) || "").trim();
  return value ? Number(value) : null;
}

export function StakeholderProfile({
  organizationId,
  data,
}: {
  organizationId: string;
  data: StakeholderProfileData;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] =
    useState<StakeholderContact | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(
    null,
  );
  const [selectedPipeline, setSelectedPipeline] =
    useState<StakeholderPipelineEntry | null>(null);
  const [tasks, setTasks] = useState(data.tasks);
  const [selectedTask, setSelectedTask] = useState<TaskView | null>(null);
  const stakeholder = data.stakeholder;
  const activeContracts = data.contracts.filter(
    (contract) => contract.status === "active",
  );
  const previousContracts = data.contracts.filter(
    (contract) => contract.status !== "active",
  );
  const activePipeline =
    data.pipelineEntries.find((entry) => !entry.closed_at) ?? null;
  const committeeOptions = data.taskCommittees;
  const responsiblePeople = data.members
    .filter((member) => member.status === "active")
    .map((member) => ({
      id: member.user_id,
      name: member.full_name || member.email,
      committeeIds: member.committees.map((committee) => committee.id),
    }));

  useEffect(() => {
    setTasks(data.tasks);
    setSelectedTask((current) =>
      current
        ? (data.tasks.find((task) => task.id === current.id) ?? current)
        : null,
    );
  }, [data.tasks]);

  async function jsonMutation(
    url: string,
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
    fallback: string,
  ) {
    setBusy(true);
    setError(null);
    try {
      await readMutationResponse(
        await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, organizationId }),
        }),
        fallback,
      );
      setDialog(null);
      setSelectedContact(null);
      setSelectedContractId(null);
      setSelectedPipeline(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  async function editStakeholder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await jsonMutation(
      `/api/stakeholders/${stakeholder.id}`,
      "PATCH",
      {
        name: form.get("name"),
        stakeholderType: form.get("stakeholderType"),
        relationshipStatus: form.get("relationshipStatus"),
        internalOwnerUserId: nullable(form, "internalOwnerUserId"),
        website: nullable(form, "website"),
        email: nullable(form, "email"),
        phone: nullable(form, "phone"),
        cvrNumber: nullable(form, "cvrNumber"),
        addressLine: nullable(form, "addressLine"),
        postalCode: nullable(form, "postalCode"),
        city: nullable(form, "city"),
        country: nullable(form, "country"),
        notes: nullable(form, "notes"),
        nextFollowUpAt: nullable(form, "nextFollowUpAt")
          ? new Date(String(form.get("nextFollowUpAt"))).toISOString()
          : null,
        nextFollowUpNote: nullable(form, "nextFollowUpNote"),
      },
      "Interessenten kunne ikke opdateres.",
    );
  }

  async function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await jsonMutation(
      selectedContact
        ? `/api/stakeholders/${stakeholder.id}/contacts/${selectedContact.id}`
        : `/api/stakeholders/${stakeholder.id}/contacts`,
      selectedContact ? "PATCH" : "POST",
      {
        name: form.get("name"),
        jobTitle: nullable(form, "jobTitle"),
        email: nullable(form, "email"),
        phone: nullable(form, "phone"),
        isPrimary: form.get("isPrimary") === "on",
        notes: nullable(form, "notes"),
      },
      "Kontaktpersonen kunne ikke gemmes.",
    );
  }

  async function archiveContact(contact: StakeholderContact) {
    if (!window.confirm(`Fjern ${contact.name} fra aktive kontaktpersoner?`))
      return;
    await jsonMutation(
      `/api/stakeholders/${stakeholder.id}/contacts/${contact.id}`,
      "PATCH",
      { action: "archive" },
      "Kontaktpersonen kunne ikke fjernes.",
    );
  }

  async function createContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await jsonMutation(
      `/api/stakeholders/${stakeholder.id}/contracts`,
      "POST",
      {
        title: form.get("title"),
        status: form.get("status"),
        contractValue: amount(form, "contractValue"),
        annualValue: amount(form, "annualValue"),
        currency: form.get("currency"),
        startDate: form.get("startDate"),
        endDate: nullable(form, "endDate"),
        noticeDeadline: nullable(form, "noticeDeadline"),
        renewalDeadline: nullable(form, "renewalDeadline"),
        autoRenew: form.get("autoRenew") === "on",
        notes: nullable(form, "notes"),
      },
      "Kontrakten kunne ikke oprettes.",
    );
  }

  async function createDeliverable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!selectedContractId) return;
    await jsonMutation(
      `/api/stakeholder-contracts/${selectedContractId}/deliverables`,
      "POST",
      {
        stakeholderId: stakeholder.id,
        deliverableType: form.get("deliverableType"),
        title: form.get("title"),
        description: nullable(form, "description"),
        quantityDetails: nullable(form, "quantityDetails"),
        fulfillmentStatus: form.get("fulfillmentStatus"),
      },
      "Aftaleindholdet kunne ikke gemmes.",
    );
  }

  async function createActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await jsonMutation(
      `/api/stakeholders/${stakeholder.id}/activities`,
      "POST",
      {
        activityType: form.get("activityType"),
        title: form.get("title"),
        description: nullable(form, "description"),
        occurredAt: new Date(String(form.get("occurredAt"))).toISOString(),
        contactId: nullable(form, "contactId"),
        contractId: nullable(form, "contractId"),
      },
      "Aktiviteten kunne ikke registreres.",
    );
  }

  async function savePipeline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const stage = String(form.get("stage"));
    await jsonMutation(
      selectedPipeline
        ? `/api/stakeholders/${stakeholder.id}/pipeline/${selectedPipeline.id}`
        : `/api/stakeholders/${stakeholder.id}/pipeline`,
      selectedPipeline ? "PATCH" : "POST",
      {
        stage,
        internalOwnerUserId: nullable(form, "internalOwnerUserId"),
        estimatedValue: amount(form, "estimatedValue"),
        currency: form.get("currency"),
        nextFollowUpAt: nullable(form, "nextFollowUpAt")
          ? new Date(String(form.get("nextFollowUpAt"))).toISOString()
          : null,
        nextFollowUpNote: nullable(form, "nextFollowUpNote"),
        lostReason: stage === "lost" ? nullable(form, "lostReason") : null,
      },
      "Pipelinekortet kunne ikke gemmes.",
    );
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const form = new FormData(event.currentTarget);
      form.set(
        "relationType",
        selectedContractId ? "stakeholder_contract" : "stakeholder",
      );
      form.set("relationId", selectedContractId ?? stakeholder.id);
      await readMutationResponse(
        await fetch(`/api/organizations/${organizationId}/documents`, {
          method: "POST",
          body: form,
        }),
        "Dokumentet kunne ikke uploades.",
      );
      setDialog(null);
      setSelectedContractId(null);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Dokumentet kunne ikke uploades.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function linkDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const documentId = String(form.get("documentId") || "");
    if (!documentId) return;
    await jsonMutation(
      `/api/documents/${documentId}/relations`,
      "POST",
      {
        relationType: selectedContractId
          ? "stakeholder_contract"
          : "stakeholder",
        relationId: selectedContractId ?? stakeholder.id,
      },
      "Dokumentet kunne ikke knyttes til relationen.",
    );
  }

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <Breadcrumbs
        items={[
          {
            label: "Interessenter",
            href: `/organizations/${organizationId}/stakeholders`,
          },
          { label: stakeholder.name },
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3 sm:gap-4 sm:pb-4">
        <div className="min-w-0">
          <p className="page-eyebrow text-muted">
            {stakeholderTypeLabels[stakeholder.stakeholder_type]}
          </p>
          <h1 className="page-title break-words">{stakeholder.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge
              tone={
                stakeholder.relationship_status === "active"
                  ? "success"
                  : "neutral"
              }
            >
              {stakeholderStatusLabels[stakeholder.relationship_status]}
            </StatusBadge>
            {activePipeline ? (
              <StatusBadge tone="progress">
                {stakeholderPipelineStageLabels[activePipeline.stage]}
              </StatusBadge>
            ) : null}
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {data.capabilities.addActivities ? (
            <Button onClick={() => setDialog("activity")} variant="secondary">
              Registrér aktivitet
            </Button>
          ) : null}
          {data.capabilities.manageContracts ? (
            <Button onClick={() => setDialog("contract")}>Ny kontrakt</Button>
          ) : null}
          {data.capabilities.updateStakeholders ? (
            <ActionMenu label="Flere handlinger">
              <button
                className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-subtle"
                onClick={() => setDialog("edit")}
                type="button"
              >
                Redigér stamdata
              </button>
              {!activePipeline && data.capabilities.managePipeline ? (
                <button
                  className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-subtle"
                  onClick={() => {
                    setSelectedPipeline(null);
                    setDialog("pipeline");
                  }}
                  type="button"
                >
                  Tilføj til pipeline
                </button>
              ) : null}
            </ActionMenu>
          ) : null}
        </div>
      </div>

      <section
        aria-label="Relationsnøgletal"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <div className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4">
          <p className="metadata">Årlig værdi</p>
          <p className="mt-1.5 break-words text-lg font-semibold tabular-nums sm:mt-2 sm:text-xl">
            {formatStakeholderCurrency(stakeholder.activeAnnualValue)}
          </p>
        </div>
        <div className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4">
          <p className="metadata">Aktiv aftale</p>
          <p className="mt-1.5 break-words text-sm font-semibold sm:mt-2 sm:text-base">
            {stakeholder.activeContract
              ? `${formatDate(stakeholder.activeContract.start_date)} – ${formatDate(stakeholder.activeContract.end_date)}`
              : "Ingen"}
          </p>
        </div>
        <div className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4">
          <p className="metadata">Fornyelse senest</p>
          <p className="mt-1.5 break-words text-sm font-semibold sm:mt-2 sm:text-base">
            {formatDate(stakeholder.activeContract?.renewal_deadline ?? null)}
          </p>
        </div>
        <div className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4">
          <p className="metadata">Intern ansvarlig</p>
          <p className="mt-1.5 break-words text-sm font-semibold sm:mt-2 sm:text-base">
            {stakeholder.ownerName ?? "Ikke tildelt"}
          </p>
        </div>
      </section>

      {error ? (
        <p
          className="rounded-[var(--radius-control)] border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,.8fr)] xl:items-start">
        <div className="min-w-0 space-y-5">
          <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Kontrakter</h2>
              {data.capabilities.manageContracts ? (
                <Button onClick={() => setDialog("contract")} size="sm">
                  Ny kontrakt
                </Button>
              ) : null}
            </div>
            {activeContracts.length ? (
              <div className="mt-3 space-y-3">
                {activeContracts.map((contract) => (
                  <article
                    className="min-w-0 rounded-[var(--radius-control)] border border-line p-3 sm:p-4"
                    key={contract.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="break-words font-semibold">
                          {contract.title}
                        </h3>
                        <p className="mt-1 text-sm text-muted">
                          {formatDate(contract.start_date)} –{" "}
                          {formatDate(contract.end_date)}
                        </p>
                      </div>
                      <StatusBadge tone="success">Aktiv</StatusBadge>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                      <div>
                        <dt className="metadata">Kontraktværdi</dt>
                        <dd className="break-words tabular-nums">
                          {contract.contract_value === null
                            ? "–"
                            : formatStakeholderCurrency(
                                Number(contract.contract_value),
                                contract.currency,
                              )}
                        </dd>
                      </div>
                      <div>
                        <dt className="metadata">Årlig værdi</dt>
                        <dd className="break-words tabular-nums">
                          {contract.annual_value === null
                            ? "–"
                            : formatStakeholderCurrency(
                                Number(contract.annual_value),
                                contract.currency,
                              )}
                        </dd>
                      </div>
                      <div>
                        <dt className="metadata">Opsigelsesfrist</dt>
                        <dd>{formatDate(contract.notice_deadline)}</dd>
                      </div>
                      <div>
                        <dt className="metadata">Fornyelsesfrist</dt>
                        <dd>{formatDate(contract.renewal_deadline)}</dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {contract.deliverables.map((item) => (
                        <span
                          className="rounded-full border border-line bg-subtle px-2 py-1 text-xs font-medium"
                          key={item.id}
                        >
                          {item.title}
                        </span>
                      ))}
                      {data.capabilities.manageContracts ? (
                        <button
                          className="rounded-full border border-dashed border-line px-2 py-1 text-xs font-semibold text-brand"
                          onClick={() => {
                            setSelectedContractId(contract.id);
                            setDialog("deliverable");
                          }}
                          type="button"
                        >
                          + Aftaleindhold
                        </button>
                      ) : null}
                      {data.capabilities.manageContracts ? (
                        <button
                          className="rounded-full border border-dashed border-line px-2 py-1 text-xs font-semibold text-brand"
                          onClick={() => {
                            setSelectedContractId(contract.id);
                            setDialog("document");
                          }}
                          type="button"
                        >
                          Upload bilag
                        </button>
                      ) : null}
                      {committeeOptions.length ? (
                        <TaskCreateModal
                          categorySource={tasks}
                          committeeId=""
                          committeeOptions={committeeOptions}
                          initialStakeholderContractId={contract.id}
                          initialStakeholderId={stakeholder.id}
                          instanceId={`stakeholder-contract-${contract.id}`}
                          organizationId={organizationId}
                          responsiblePeople={responsiblePeople}
                          stakeholderContracts={data.taskStakeholderContracts}
                          stakeholders={data.taskStakeholders}
                          trigger={(open) => (
                            <button
                              className="rounded-full border border-dashed border-line px-2 py-1 text-xs font-semibold text-brand"
                              onClick={open}
                              type="button"
                            >
                              Opret kontraktopgave
                            </button>
                          )}
                          triggerLabel="Opret kontraktopgave"
                        />
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                description="Registrér perioder, værdi og frister på den første aftale."
                title="Ingen aktive kontrakter"
              />
            )}
            {previousContracts.length ? (
              <details className="mt-4 border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Tidligere kontrakter ({previousContracts.length})
                </summary>
                <div className="mt-2 divide-y divide-line">
                  {previousContracts.map((contract) => (
                    <div
                      className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                      key={contract.id}
                    >
                      <span>{contract.title}</span>
                      <span className="text-muted">
                        {formatDate(contract.start_date)} –{" "}
                        {formatDate(contract.end_date)} · {contract.status}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </section>

          <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Opgaver</h2>
              {committeeOptions.length ? (
                <TaskCreateModal
                  categorySource={tasks}
                  committeeId=""
                  committeeOptions={committeeOptions}
                  initialStakeholderId={stakeholder.id}
                  instanceId={`stakeholder-${stakeholder.id}`}
                  organizationId={organizationId}
                  responsiblePeople={responsiblePeople}
                  stakeholderContracts={data.taskStakeholderContracts}
                  stakeholders={data.taskStakeholders}
                  trigger={(open) => (
                    <Button onClick={open} size="sm" variant="secondary">
                      Opret opgave
                    </Button>
                  )}
                />
              ) : null}
            </div>
            {tasks.length ? (
              <div className="mt-3 divide-y divide-line">
                {tasks.map((task) => (
                  <button
                    className="grid w-full gap-1 py-3 text-left hover:text-brand sm:grid-cols-[minmax(0,1fr)_9rem_8rem]"
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    type="button"
                  >
                    <span>
                      <span className="block font-medium">{task.title}</span>
                      {task.stakeholderContract ? (
                        <span className="block text-xs text-muted">
                          {task.stakeholderContract.title}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted">
                      {task.responsible?.full_name ?? "Ingen ansvarlig"}
                    </span>
                    <span className="text-sm text-muted">
                      {taskStatusLabels[task.status]} ·{" "}
                      {formatDate(task.deadline)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                description="Opret en rigtig opgave, når relationens næste skridt kræver ansvar og deadline."
                title="Ingen opgaver knyttet til relationen."
              />
            )}
          </section>

          <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Dokumenter</h2>
              {data.capabilities.updateStakeholders ? (
                <Button
                  onClick={() => {
                    setSelectedContractId(null);
                    setDialog("document");
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Upload dokument
                </Button>
              ) : null}
            </div>
            {data.documents.length ? (
              <div className="mt-3 divide-y divide-line">
                {data.documents.map((document) => (
                  <Link
                    className="flex min-w-0 items-start justify-between gap-3 py-3 hover:text-brand"
                    href={`/organizations/${organizationId}/documents/${document.id}`}
                    key={document.id}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <AppIcon name="documents" size={16} />
                      <span className="break-words font-medium sm:truncate">
                        {document.name}
                      </span>
                    </span>
                    <span className="max-w-24 shrink-0 truncate text-right text-xs text-muted">
                      {document.categoryName ?? "Ukategoriseret"}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                description="Upload gennem Dokumenter V2; filen kan fortsat findes i det centrale dokumentarkiv."
                title="Ingen dokumenter knyttet til relationen."
              />
            )}
          </section>

          <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Aktivitetslog</h2>
              {data.capabilities.addActivities ? (
                <Button
                  onClick={() => setDialog("activity")}
                  size="sm"
                  variant="secondary"
                >
                  Registrér aktivitet
                </Button>
              ) : null}
            </div>
            {data.activities.length ? (
              <ol className="mt-3 space-y-3">
                {data.activities.map((activity) => (
                  <li className="border-l-2 border-line pl-4" key={activity.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge>
                        {stakeholderActivityLabels[activity.activity_type]}
                      </StatusBadge>
                      {activity.activity_source === "system" ? (
                        <span className="text-xs text-muted">System</span>
                      ) : null}
                      <time className="text-xs text-muted">
                        {formatDate(activity.occurred_at, true)}
                      </time>
                    </div>
                    <h3 className="mt-2 font-semibold">{activity.title}</h3>
                    {activity.description ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted">
                        {activity.description}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted">
                      {activity.creatorName ?? "Tidligere medlem"}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                compact
                title="Ingen aktiviteter registreret endnu."
              />
            )}
          </section>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-20">
          <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Kontaktpersoner</h2>
              {data.capabilities.manageContacts ? (
                <Button
                  onClick={() => {
                    setSelectedContact(null);
                    setDialog("contact");
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Tilføj
                </Button>
              ) : null}
            </div>
            {data.contacts.length ? (
              <div className="mt-3 divide-y divide-line">
                {data.contacts.map((contact) => (
                  <article className="min-w-0 py-3" key={contact.id}>
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words font-semibold">
                          {contact.name}
                        </p>
                        <p className="break-words text-sm text-muted">
                          {contact.job_title ?? "Kontaktperson"}
                        </p>
                      </div>
                      {contact.is_primary ? (
                        <StatusBadge className="shrink-0" tone="success">
                          Primær
                        </StatusBadge>
                      ) : null}
                    </div>
                    {contact.email ? (
                      <a
                        className="mt-2 block break-all text-sm text-brand hover:underline"
                        href={`mailto:${contact.email}`}
                      >
                        {contact.email}
                      </a>
                    ) : null}
                    {contact.phone ? (
                      <a
                        className="mt-1 block text-sm text-brand hover:underline"
                        href={`tel:${contact.phone}`}
                      >
                        {contact.phone}
                      </a>
                    ) : null}
                    {data.capabilities.manageContacts ? (
                      <div className="mt-2 flex gap-3">
                        <button
                          className="text-xs font-semibold text-brand"
                          onClick={() => {
                            setSelectedContact(contact);
                            setDialog("contact");
                          }}
                          type="button"
                        >
                          Redigér
                        </button>
                        <button
                          className="text-xs font-semibold text-danger"
                          onClick={() => void archiveContact(contact)}
                          type="button"
                        >
                          Fjern
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">Ingen kontaktpersoner.</p>
            )}
          </section>
          <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Sponsor-pipeline</h2>
              {activePipeline && data.capabilities.managePipeline ? (
                <button
                  className="text-xs font-semibold text-brand"
                  onClick={() => {
                    setSelectedPipeline(activePipeline);
                    setDialog("pipeline");
                  }}
                  type="button"
                >
                  Redigér
                </button>
              ) : null}
            </div>
            {activePipeline ? (
              <div className="mt-3">
                <StatusBadge tone="progress">
                  {stakeholderPipelineStageLabels[activePipeline.stage]}
                </StatusBadge>
                <p className="mt-3 text-sm">
                  <span className="metadata">Estimeret værdi</span>
                  <br />
                  {activePipeline.estimated_value === null
                    ? "–"
                    : formatStakeholderCurrency(
                        Number(activePipeline.estimated_value),
                        activePipeline.currency,
                      )}
                </p>
                <p className="mt-3 text-sm">
                  <span className="metadata">Næste opfølgning</span>
                  <br />
                  {formatDate(activePipeline.next_follow_up_at, true)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {activePipeline.next_follow_up_note}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">
                Ikke i en aktiv pipeline.
              </p>
            )}
            {data.pipelineEvents.length ? (
              <details className="mt-4 border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Pipelinehistorik
                </summary>
                <ol className="mt-2 space-y-2 text-xs text-muted">
                  {data.pipelineEvents.map((event) => (
                    <li key={event.id}>
                      {event.from_stage
                        ? stakeholderPipelineStageLabels[event.from_stage]
                        : "Oprettet"}{" "}
                      → {stakeholderPipelineStageLabels[event.to_stage]} ·{" "}
                      {formatDate(event.changed_at, true)}
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </section>
          <section className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4">
            <h2 className="section-title">Stamdata</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="metadata">Email</dt>
                <dd>{stakeholder.email ?? "–"}</dd>
              </div>
              <div>
                <dt className="metadata">Telefon</dt>
                <dd>{stakeholder.phone ?? "–"}</dd>
              </div>
              <div>
                <dt className="metadata">Website</dt>
                <dd className="break-all">
                  {stakeholder.website ? (
                    <a
                      className="text-brand hover:underline"
                      href={stakeholder.website}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {stakeholder.website}
                    </a>
                  ) : (
                    "–"
                  )}
                </dd>
              </div>
              <div>
                <dt className="metadata">CVR</dt>
                <dd>{stakeholder.cvr_number ?? "–"}</dd>
              </div>
              <div>
                <dt className="metadata">Adresse</dt>
                <dd className="break-words">
                  {[
                    stakeholder.address_line,
                    stakeholder.postal_code,
                    stakeholder.city,
                    stakeholder.country,
                  ]
                    .filter(Boolean)
                    .join(", ") || "–"}
                </dd>
              </div>
            </dl>
            {stakeholder.notes ? (
              <p className="mt-4 whitespace-pre-wrap border-t border-line pt-3 text-sm leading-6 text-muted">
                {stakeholder.notes}
              </p>
            ) : null}
          </section>
        </aside>
      </div>

      <Modal
        maxWidth="2xl"
        onClose={() => setDialog(null)}
        open={dialog === "edit"}
        title="Redigér interessent"
      >
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={editStakeholder}>
          <label className="sm:col-span-2">
            <span className="label">Navn</span>
            <Input defaultValue={stakeholder.name} name="name" required />
          </label>
          <label>
            <span className="label">Type</span>
            <Select
              defaultValue={stakeholder.stakeholder_type}
              name="stakeholderType"
            >
              {Object.entries(stakeholderTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="label">Status</span>
            <Select
              defaultValue={stakeholder.relationship_status}
              name="relationshipStatus"
            >
              {Object.entries(stakeholderStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="label">Ansvarlig</span>
            <Select
              defaultValue={stakeholder.internal_owner_user_id ?? ""}
              name="internalOwnerUserId"
            >
              <option value="">Ingen</option>
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
            <Input defaultValue={stakeholder.website ?? ""} name="website" />
          </label>
          <label>
            <span className="label">Email</span>
            <Input
              defaultValue={stakeholder.email ?? ""}
              name="email"
              type="email"
            />
          </label>
          <label>
            <span className="label">Telefon</span>
            <Input defaultValue={stakeholder.phone ?? ""} name="phone" />
          </label>
          <label>
            <span className="label">CVR</span>
            <Input
              defaultValue={stakeholder.cvr_number ?? ""}
              name="cvrNumber"
            />
          </label>
          <label>
            <span className="label">Adresse</span>
            <Input
              defaultValue={stakeholder.address_line ?? ""}
              name="addressLine"
            />
          </label>
          <label>
            <span className="label">Postnummer</span>
            <Input
              defaultValue={stakeholder.postal_code ?? ""}
              name="postalCode"
            />
          </label>
          <label>
            <span className="label">By</span>
            <Input defaultValue={stakeholder.city ?? ""} name="city" />
          </label>
          <label>
            <span className="label">Land</span>
            <Input defaultValue={stakeholder.country ?? ""} name="country" />
          </label>
          <label>
            <span className="label">Næste opfølgning</span>
            <Input
              defaultValue={toLocalInput(stakeholder.next_follow_up_at)}
              name="nextFollowUpAt"
              type="datetime-local"
            />
          </label>
          <label>
            <span className="label">Næste handling</span>
            <Input
              defaultValue={stakeholder.next_follow_up_note ?? ""}
              name="nextFollowUpNote"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="label">Noter</span>
            <Textarea defaultValue={stakeholder.notes ?? ""} name="notes" />
          </label>
          <DialogFooter busy={busy} close={() => setDialog(null)} />
        </form>
      </Modal>
      <Modal
        onClose={() => setDialog(null)}
        open={dialog === "contact"}
        title={
          selectedContact ? "Redigér kontaktperson" : "Tilføj kontaktperson"
        }
      >
        <form className="space-y-4" onSubmit={saveContact}>
          <label>
            <span className="label">Navn *</span>
            <Input
              defaultValue={selectedContact?.name ?? ""}
              name="name"
              required
            />
          </label>
          <label>
            <span className="label">Rolle/titel</span>
            <Input
              defaultValue={selectedContact?.job_title ?? ""}
              name="jobTitle"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="label">Email</span>
              <Input
                defaultValue={selectedContact?.email ?? ""}
                name="email"
                type="email"
              />
            </label>
            <label>
              <span className="label">Telefon</span>
              <Input defaultValue={selectedContact?.phone ?? ""} name="phone" />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2">
            <input
              defaultChecked={selectedContact?.is_primary}
              name="isPrimary"
              type="checkbox"
            />{" "}
            Primær kontakt
          </label>
          <label>
            <span className="label">Noter</span>
            <Textarea
              defaultValue={selectedContact?.notes ?? ""}
              name="notes"
            />
          </label>
          <DialogFooter busy={busy} close={() => setDialog(null)} />
        </form>
      </Modal>
      <Modal
        maxWidth="2xl"
        onClose={() => setDialog(null)}
        open={dialog === "contract"}
        title="Ny kontrakt"
      >
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={createContract}>
          <label className="sm:col-span-2">
            <span className="label">Titel *</span>
            <Input name="title" required />
          </label>
          <label>
            <span className="label">Status</span>
            <Select defaultValue="active" name="status">
              <option value="draft">Udkast</option>
              <option value="active">Aktiv</option>
              <option value="expired">Udløbet</option>
              <option value="terminated">Opsagt</option>
            </Select>
          </label>
          <label>
            <span className="label">Valuta</span>
            <Select defaultValue="DKK" name="currency">
              <option value="DKK">DKK</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </Select>
          </label>
          <label>
            <span className="label">Kontraktværdi</span>
            <Input min="0" name="contractValue" step="0.01" type="number" />
          </label>
          <label>
            <span className="label">Årlig værdi</span>
            <Input min="0" name="annualValue" step="0.01" type="number" />
          </label>
          <label>
            <span className="label">Startdato *</span>
            <Input name="startDate" required type="date" />
          </label>
          <label>
            <span className="label">Slutdato</span>
            <Input name="endDate" type="date" />
          </label>
          <label>
            <span className="label">Opsigelsesfrist</span>
            <Input name="noticeDeadline" type="date" />
          </label>
          <label>
            <span className="label">Fornyelsesdeadline</span>
            <Input name="renewalDeadline" type="date" />
          </label>
          <label className="flex min-h-11 items-center gap-2 sm:col-span-2">
            <input name="autoRenew" type="checkbox" /> Automatisk fornyelse
          </label>
          <label className="sm:col-span-2">
            <span className="label">Noter</span>
            <Textarea name="notes" />
          </label>
          <DialogFooter busy={busy} close={() => setDialog(null)} />
        </form>
      </Modal>
      <Modal
        onClose={() => setDialog(null)}
        open={dialog === "deliverable"}
        title="Tilføj aftaleindhold"
      >
        <form className="space-y-4" onSubmit={createDeliverable}>
          <label>
            <span className="label">Type *</span>
            <Select name="deliverableType">
              <option value="banner_advertising">Bandereklame</option>
              <option value="shirt_sponsor">Trøjesponsor</option>
              <option value="social_media">SoMe-eksponering</option>
              <option value="sponsor_event">Sponsorarrangement</option>
              <option value="tickets">Billetter</option>
              <option value="vip_event">VIP-arrangement</option>
              <option value="website_logo">Website-logo</option>
              <option value="other">Andet</option>
            </Select>
          </label>
          <label>
            <span className="label">Titel *</span>
            <Input name="title" required />
          </label>
          <label>
            <span className="label">Beskrivelse</span>
            <Textarea name="description" />
          </label>
          <label>
            <span className="label">Omfang/antal</span>
            <Input name="quantityDetails" />
          </label>
          <input name="fulfillmentStatus" type="hidden" value="planned" />
          <DialogFooter busy={busy} close={() => setDialog(null)} />
        </form>
      </Modal>
      <Modal
        onClose={() => setDialog(null)}
        open={dialog === "activity"}
        title="Registrér aktivitet"
      >
        <form className="space-y-4" onSubmit={createActivity}>
          <label>
            <span className="label">Type</span>
            <Select name="activityType">
              {Object.entries(stakeholderActivityLabels)
                .filter(([value]) => value !== "pipeline_change")
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </Select>
          </label>
          <label>
            <span className="label">Titel *</span>
            <Input name="title" required />
          </label>
          <label>
            <span className="label">Tidspunkt</span>
            <Input
              defaultValue={toLocalInput(new Date().toISOString())}
              name="occurredAt"
              required
              type="datetime-local"
            />
          </label>
          <label>
            <span className="label">Kontaktperson</span>
            <Select name="contactId">
              <option value="">Ingen</option>
              {data.contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="label">Kontrakt</span>
            <Select name="contractId">
              <option value="">Ingen</option>
              {data.contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.title}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="label">Beskrivelse</span>
            <Textarea name="description" />
          </label>
          <DialogFooter busy={busy} close={() => setDialog(null)} />
        </form>
      </Modal>
      <Modal
        onClose={() => setDialog(null)}
        open={dialog === "pipeline"}
        title={
          selectedPipeline
            ? "Redigér pipelinekort"
            : "Tilføj til sponsor-pipeline"
        }
      >
        <form className="space-y-4" onSubmit={savePipeline}>
          <label>
            <span className="label">Fase</span>
            <Select
              defaultValue={selectedPipeline?.stage ?? "lead"}
              name="stage"
            >
              {stakeholderPipelineStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stakeholderPipelineStageLabels[stage]}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="label">Intern ansvarlig</span>
            <Select
              defaultValue={
                selectedPipeline?.internal_owner_user_id ??
                stakeholder.internal_owner_user_id ??
                ""
              }
              name="internalOwnerUserId"
            >
              <option value="">Ingen</option>
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
            <span className="label">Estimeret værdi</span>
            <Input
              defaultValue={selectedPipeline?.estimated_value ?? ""}
              min="0"
              name="estimatedValue"
              step="0.01"
              type="number"
            />
          </label>
          <input
            name="currency"
            type="hidden"
            value={selectedPipeline?.currency ?? "DKK"}
          />
          <label>
            <span className="label">Næste opfølgning</span>
            <Input
              defaultValue={toLocalInput(
                selectedPipeline?.next_follow_up_at ?? null,
              )}
              name="nextFollowUpAt"
              type="datetime-local"
            />
          </label>
          <label>
            <span className="label">Næste handling</span>
            <Input
              defaultValue={selectedPipeline?.next_follow_up_note ?? ""}
              name="nextFollowUpNote"
            />
          </label>
          <label>
            <span className="label">Årsag ved Tabt</span>
            <Textarea
              defaultValue={selectedPipeline?.lost_reason ?? ""}
              name="lostReason"
            />
          </label>
          <DialogFooter busy={busy} close={() => setDialog(null)} />
        </form>
      </Modal>
      <Modal
        onClose={() => setDialog(null)}
        open={dialog === "document"}
        title={selectedContractId ? "Kontraktdokument" : "Interessentdokument"}
      >
        {data.availableDocuments.length ? (
          <form
            className="mb-5 space-y-3 border-b border-line pb-5"
            onSubmit={linkDocument}
          >
            <label>
              <span className="label">Knyt eksisterende dokument</span>
              <Select name="documentId" required>
                <option value="">Vælg dokument</option>
                {data.availableDocuments.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.title}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex justify-end">
              <Button disabled={busy} type="submit" variant="secondary">
                Knyt dokument
              </Button>
            </div>
          </form>
        ) : null}
        <form className="space-y-4" onSubmit={uploadDocument}>
          <label>
            <span className="label">Fil *</span>
            <Input name="file" required type="file" />
          </label>
          <label>
            <span className="label">Dokumentnavn *</span>
            <Input name="name" required />
          </label>
          <label>
            <span className="label">Beskrivelse</span>
            <Textarea name="description" />
          </label>
          <DialogFooter
            busy={busy}
            close={() => setDialog(null)}
            submitLabel="Upload dokument"
          />
        </form>
      </Modal>
      {selectedTask ? (
        <TaskDetailModal
          canEdit={data.editableCommitteeIds.includes(
            selectedTask.committee_id,
          )}
          onClose={() => setSelectedTask(null)}
          onUpdated={(updatedTask) => {
            setTasks((current) =>
              current.map((task) =>
                task.id === updatedTask.id ? updatedTask : task,
              ),
            );
            setSelectedTask(updatedTask);
          }}
          open
          organizationId={organizationId}
          responsiblePeople={responsiblePeople.filter((person) =>
            person.committeeIds.includes(selectedTask.committee_id),
          )}
          stakeholderContracts={data.taskStakeholderContracts}
          stakeholders={data.taskStakeholders}
          task={selectedTask}
        />
      ) : null}
    </div>
  );
}

function DialogFooter({
  busy,
  close,
  submitLabel = "Gem",
}: {
  busy: boolean;
  close: () => void;
  submitLabel?: string;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
      <Button disabled={busy} onClick={close} type="button" variant="secondary">
        Annuller
      </Button>
      <Button disabled={busy} type="submit">
        {busy ? "Gemmer…" : submitLabel}
      </Button>
    </div>
  );
}
