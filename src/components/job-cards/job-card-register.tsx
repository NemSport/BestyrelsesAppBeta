"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  ActionMenu,
  Button,
  EmptyState,
  Input,
  Modal,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import type {
  JobCardOverview,
  RoleProfileView,
} from "@/types/domain";

type DocumentDraft = { title: string; url: string };
type TemplateDraft = {
  committeeId: string;
  title: string;
  description: string;
  category: string;
  defaultDeadlineDays: number | null;
};
type RoleDraft = {
  id?: string;
  title: string;
  purpose: string;
  description: string;
  responsibilities: string;
  exclusions: string;
  competencies: string;
  collaboration: string;
  meetingExpectations: string;
  contactPeople: string;
  responsibilityAreaIds: string[];
  responsibilityAreaNames: string[];
  committeeIds: string[];
  assignedUserIds: string[];
  annualWheelEventIds: string[];
  decisionIds: string[];
  documents: DocumentDraft[];
  taskTemplates: TemplateDraft[];
  onboarding: {
    introduction: string;
    first30Days: string;
    practicalInformation: string;
  };
};
type JobCardStatusFilter = "all" | "active" | "archived";
type JobCardAssignmentFilter = "all" | "assigned" | "unassigned";
type AiJobCardDraft = {
  title: string; purpose: string; description: string; responsibilities: string;
  exclusions: string; competencies: string; collaboration: string;
  meetingExpectations: string; contactPeople: string;
  responsibilityAreas: string[]; committeeNames: string[];
  taskTemplates: Array<{ title: string; description: string; category: string; committeeName: string; defaultDeadlineDays: number | null }>;
  onboarding: { introduction: string; first30Days: string; practicalInformation: string };
  rationale: string; sourceIds: string[]; sources: Array<{ id: string; label: string }>;
};

function emptyDraft(): RoleDraft {
  return {
    title: "",
    purpose: "",
    description: "",
    responsibilities: "",
    exclusions: "",
    competencies: "",
    collaboration: "",
    meetingExpectations: "",
    contactPeople: "",
    responsibilityAreaIds: [],
    responsibilityAreaNames: [],
    committeeIds: [],
    assignedUserIds: [],
    annualWheelEventIds: [],
    decisionIds: [],
    documents: [],
    taskTemplates: [],
    onboarding: {
      introduction: "",
      first30Days: "",
      practicalInformation: "",
    },
  };
}

function fromRole(role: RoleProfileView): RoleDraft {
  return {
    id: role.id,
    title: role.title,
    purpose: role.purpose,
    description: role.description,
    responsibilities: role.responsibilities,
    exclusions: role.exclusions,
    competencies: role.competencies,
    collaboration: role.collaboration,
    meetingExpectations: role.meeting_expectations,
    contactPeople: role.contact_people,
    responsibilityAreaIds: role.responsibilityAreas.map((area) => area.id),
    responsibilityAreaNames: [],
    committeeIds: role.committees.map((committee) => committee.id),
    assignedUserIds: role.assignments.map((assignment) => assignment.userId),
    annualWheelEventIds: role.annualWheelEvents.map((event) => event.id),
    decisionIds: role.decisions.map((decision) => decision.id),
    documents: role.documents.map(({ title, url }) => ({ title, url })),
    taskTemplates: role.taskTemplates.map((template) => ({
      committeeId: template.committee_id,
      title: template.title,
      description: template.description,
      category: template.category ?? "",
      defaultDeadlineDays: template.default_deadline_days,
    })),
    onboarding: {
      introduction: role.onboardingGuide?.introduction ?? "",
      first30Days: role.onboardingGuide?.first_30_days ?? "",
      practicalInformation:
        role.onboardingGuide?.practical_information ?? "",
    },
  };
}

function toggle(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((current) => current !== value)
    : [...values, value];
}

function normalizeAreaName(value: string) {
  return value.trim().toLocaleLowerCase("da-DK");
}

function addResponsibilityAreaInput(
  draft: RoleDraft,
  value: string,
  areas: JobCardOverview["responsibilityAreas"],
) {
  const name = value.trim();
  if (!name) return draft;
  const normalized = normalizeAreaName(name);
  const existing = areas.find((area) => normalizeAreaName(area.name) === normalized);
  if (existing) {
    return {
      ...draft,
      responsibilityAreaIds: [
        ...new Set([...draft.responsibilityAreaIds, existing.id]),
      ],
      responsibilityAreaNames: draft.responsibilityAreaNames.filter(
        (current) => normalizeAreaName(current) !== normalized,
      ),
    };
  }
  return {
    ...draft,
    responsibilityAreaNames: [
      ...new Map(
        [...draft.responsibilityAreaNames, name]
          .map((current) => current.trim())
          .filter(Boolean)
          .map((current) => [normalizeAreaName(current), current]),
      ).values(),
    ],
  };
}

function compactFieldErrors(payload: { fieldErrors?: Record<string, string[]> }) {
  return [
    ...new Set(
      Object.values(payload.fieldErrors ?? {})
        .flatMap((messages) => messages)
        .filter(Boolean),
    ),
  ];
}

function payloadForSubmit(organizationId: string, draft: RoleDraft) {
  return {
    organizationId,
    ...draft,
    responsibilityAreaIds: [...new Set(draft.responsibilityAreaIds)],
    responsibilityAreaNames: [
      ...new Map(
        draft.responsibilityAreaNames
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => [normalizeAreaName(name), name]),
      ).values(),
    ],
    documents: draft.documents.filter(
      (document) => document.title.trim() || document.url.trim(),
    ),
    taskTemplates: draft.taskTemplates
      .filter(
        (template) =>
          template.title.trim() ||
          template.description.trim() ||
          template.category.trim() ||
          template.defaultDeadlineDays !== null,
      )
      .map((template) => ({
        ...template,
        category: template.category || null,
      })),
  };
}

function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "").toLocaleLowerCase("da-DK").trim();
}

function roleSearchText(role: RoleProfileView) {
  return [
    role.title,
    role.purpose,
    role.description,
    role.responsibilities,
    role.competencies,
    role.collaboration,
    role.meeting_expectations,
    role.contact_people,
    ...role.assignments.flatMap((assignment) => [
      assignment.name,
      assignment.email,
    ]),
    ...role.committees.map((committee) => committee.name),
    ...role.responsibilityAreas.map((area) => area.name),
  ]
    .filter(Boolean)
    .join(" ");
}

export function JobCardRegister({
  organizationId,
  data,
}: {
  organizationId: string;
  data: JobCardOverview;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<RoleDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [areaName, setAreaName] = useState("");
  const [taskMessage, setTaskMessage] = useState<string | null>(null);
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [pdfDownloadingId, setPdfDownloadingId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<JobCardStatusFilter>("all");
  const [committeeFilter, setCommitteeFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] =
    useState<JobCardAssignmentFilter>("all");

  const normalizedSearchTerm = normalizeSearchValue(searchTerm);
  const filtersAreActive =
    normalizedSearchTerm ||
    statusFilter !== "all" ||
    committeeFilter !== "all" ||
    assignmentFilter !== "all";
  const filteredRoles = data.roles.filter((role) => {
    const matchesSearch =
      !normalizedSearchTerm ||
      normalizeSearchValue(roleSearchText(role)).includes(normalizedSearchTerm);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && !role.archived_at) ||
      (statusFilter === "archived" && Boolean(role.archived_at));
    const matchesCommittee =
      committeeFilter === "all" ||
      role.committees.some((committee) => committee.id === committeeFilter);
    const matchesAssignment =
      assignmentFilter === "all" ||
      (assignmentFilter === "assigned" && role.assignments.length > 0) ||
      (assignmentFilter === "unassigned" && role.assignments.length === 0);

    return (
      matchesSearch &&
      matchesStatus &&
      matchesCommittee &&
      matchesAssignment
    );
  });
  const resultText = filtersAreActive
    ? `Viser ${filteredRoles.length} af ${data.roles.length} jobkort`
    : `Viser ${data.roles.length} jobkort`;

  function resetFilters() {
    setSearchTerm("");
    setStatusFilter("all");
    setCommitteeFilter("all");
    setAssignmentFilter("all");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    const draftForSubmit = addResponsibilityAreaInput(
      draft,
      areaName,
      data.responsibilityAreas,
    );
    try {
      const response = await fetch(
        draft.id
          ? `/api/job-cards/${draft.id}`
          : `/api/organizations/${organizationId}/job-cards`,
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadForSubmit(organizationId, draftForSubmit)),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fieldMessages = compactFieldErrors(payload);
        setError(
          fieldMessages.length
            ? fieldMessages.join(" ")
            : payload.error ?? "Jobkortet kunne ikke gemmes.",
        );
        return;
      }
      setDraft(null);
      setAreaName("");
      router.refresh();
    } catch (error) {
      console.error("[job-cards] Jobkort-formular kunne ikke gemmes", error);
      setError("Forbindelsen til serveren mislykkedes. Prøv igen.");
    } finally {
      setSaving(false);
    }
  }

  async function archive(roleId: string) {
    if (!window.confirm("Vil du arkivere dette jobkort?")) return;
    const response = await fetch(`/api/job-cards/${roleId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Jobkortet kunne ikke arkiveres.");
      return;
    }
    setDraft(null);
    router.refresh();
  }

  function createArea() {
    if (!draft || !areaName.trim()) return;
    setDraft(addResponsibilityAreaInput(draft, areaName, data.responsibilityAreas));
    setAreaName("");
  }

  async function instantiate(templateId: string) {
    setTaskMessage(null);
    const response = await fetch(
      `/api/task-templates/${templateId}/instantiate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    setTaskMessage(
      response.ok
        ? "Opgaven er oprettet i Task View."
        : payload.error ?? "Opgaven kunne ikke oprettes.",
    );
    if (response.ok) router.refresh();
  }

  async function downloadPdf(role: RoleProfileView) {
    setPdfError(null);
    setPdfDownloadingId(role.id);
    try {
      const response = await fetch(
        `/api/job-cards/${role.id}/pdf?organizationId=${organizationId}`,
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          payload.error ?? "PDF-filen kunne ikke downloades. Prøv igen.",
        );
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      const fileName =
        disposition?.match(/filename="([^"]+)"/i)?.[1] ?? "jobkort.pdf";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setPdfError(
        error instanceof Error
          ? error.message
          : "PDF-filen kunne ikke downloades. Prøv igen.",
      );
    } finally {
      setPdfDownloadingId(null);
    }
  }

  async function suggest(role?: RoleProfileView) {
    setAiLoadingId(role?.id ?? "new");
    setTaskMessage(null);
    const response = await fetch(
      `/api/organizations/${organizationId}/job-cards/suggestions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          roleProfileId: role?.id ?? null,
        }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    setAiLoadingId(null);
    if (!response.ok) {
      setTaskMessage(payload.error ?? "AI kunne ikke foreslå et jobkort.");
      return;
    }
    const suggestion = payload as AiJobCardDraft;
    const base = role ? fromRole(role) : emptyDraft();
    const normalizedAreas = new Set(
      suggestion.responsibilityAreas.map((value) =>
        normalizeAreaName(value),
      ),
    );
    const normalizedCommittees = new Set(
      suggestion.committeeNames.map((value) =>
        value.toLocaleLowerCase("da-DK"),
      ),
    );
    setDraft({
      ...base,
      title: suggestion.title,
      purpose: suggestion.purpose,
      description: suggestion.description,
      responsibilities: suggestion.responsibilities,
      exclusions: suggestion.exclusions,
      competencies: suggestion.competencies,
      collaboration: suggestion.collaboration,
      meetingExpectations: suggestion.meetingExpectations,
      contactPeople: suggestion.contactPeople,
      responsibilityAreaIds: data.responsibilityAreas
        .filter((area) =>
          normalizedAreas.has(normalizeAreaName(area.name)),
        )
        .map((area) => area.id),
      responsibilityAreaNames: suggestion.responsibilityAreas.filter(
        (suggestedArea) =>
          !data.responsibilityAreas.some(
            (area) => normalizeAreaName(area.name) === normalizeAreaName(suggestedArea),
          ),
      ),
      committeeIds: data.committees
        .filter((committee) =>
          normalizedCommittees.has(committee.name.toLocaleLowerCase("da-DK")),
        )
        .map((committee) => committee.id),
      taskTemplates: suggestion.taskTemplates.flatMap((template) => {
        const committee = data.committees.find(
          (candidate) =>
            candidate.name.toLocaleLowerCase("da-DK") ===
            template.committeeName.toLocaleLowerCase("da-DK"),
        );
        return committee
          ? [{ ...template, committeeId: committee.id }]
          : [];
      }),
      onboarding: suggestion.onboarding,
    });
    setTaskMessage(
      `AI-udkast åbnet til gennemgang. Kilder: ${suggestion.sourceIds
        .map(
          (sourceId) =>
            suggestion.sources.find((source) => source.id === sourceId)?.label,
        )
        .filter(Boolean)
        .join(", ")}.`,
    );
  }

  return (
    <div className="space-y-7">
      {data.roles.some((role) =>
        role.assignments.some(
          (assignment) => assignment.userId === data.currentUserId,
        ),
      ) ? (
        <section className="border-l-2 border-brand bg-brand-soft/45 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="page-eyebrow">Din onboarding</p>
              <h2 className="mt-1 text-base font-semibold">
                Roller du aktuelt varetager
              </h2>
              <p className="mt-1 text-sm text-muted">
                Gå direkte til introduktion, første 30 dage og praktisk
                rolleviden.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.roles
              .filter((role) =>
                role.assignments.some(
                  (assignment) =>
                    assignment.userId === data.currentUserId,
                ),
              )
              .map((role) => (
                <a
                  className="button-secondary text-xs"
                  href={`#job-card-${role.id}`}
                  key={role.id}
                >
                  Åbn onboarding for {role.title}
                </a>
              ))}
          </div>
        </section>
      ) : null}
      {data.canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="font-semibold">Organisationens rollehåndbog</p>
            <p className="text-sm text-muted">
              Jobkort ændres kun af ejere og administratorer.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDraft(emptyDraft())}>Opret jobkort</Button>
            <ActionMenu>
              <button
                className="block w-full px-3 py-2 text-left text-sm hover:bg-subtle"
                disabled={aiLoadingId !== null}
                onClick={() => void suggest()}
                type="button"
              >
                {aiLoadingId === "new"
                  ? "Analyserer..."
                  : "Foreslå jobkort med AI"}
              </button>
            </ActionMenu>
          </div>
        </div>
      ) : null}
      {taskMessage ? (
        <div className="rounded-[var(--radius-control)] bg-subtle p-3 text-sm">
          {taskMessage}
        </div>
      ) : null}
      {pdfError ? <div className="alert-danger p-3 text-sm">{pdfError}</div> : null}
      {data.roles.length ? (
        <>
          <section className="border-y border-line bg-subtle/35 px-4 py-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto] lg:items-end">
              <label className="space-y-1.5">
                <span className="label">Søg jobkort</span>
                <Input
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Søg efter rolle, udvalg, ansvar..."
                  value={searchTerm}
                />
              </label>
              <label className="space-y-1.5">
                <span className="label">Status</span>
                <select
                  className="field min-w-[150px]"
                  onChange={(event) =>
                    setStatusFilter(event.target.value as JobCardStatusFilter)
                  }
                  value={statusFilter}
                >
                  <option value="all">Alle</option>
                  <option value="active">Aktiv</option>
                  <option value="archived">Arkiveret</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="label">Udvalg</span>
                <select
                  className="field min-w-[170px]"
                  onChange={(event) => setCommitteeFilter(event.target.value)}
                  value={committeeFilter}
                >
                  <option value="all">Alle udvalg</option>
                  {data.committees.map((committee) => (
                    <option key={committee.id} value={committee.id}>
                      {committee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="label">Rolleholder</span>
                <select
                  className="field min-w-[160px]"
                  onChange={(event) =>
                    setAssignmentFilter(
                      event.target.value as JobCardAssignmentFilter,
                    )
                  }
                  value={assignmentFilter}
                >
                  <option value="all">Alle</option>
                  <option value="assigned">Med rolleholder</option>
                  <option value="unassigned">Uden rolleholder</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span>{resultText}</span>
              {filtersAreActive ? (
                <Button onClick={resetFilters} size="sm" variant="ghost">
                  Ryd filtre
                </Button>
              ) : null}
            </div>
          </section>
          {filteredRoles.length ? (
            <div className="space-y-4">
              {filteredRoles.map((role) => (
            <article
              className="scroll-mt-24 border border-line bg-surface px-4 py-5 shadow-sm sm:px-5"
              id={`job-card-${role.id}`}
              key={role.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="page-eyebrow">Jobkort</p>
                    <StatusBadge tone={role.archived_at ? "neutral" : "success"}>
                      {role.archived_at ? "Arkiveret" : "Aktiv"}
                    </StatusBadge>
                  </div>
                  <h2 className="mt-1 text-lg font-semibold">{role.title}</h2>
                  <p className="mt-2 max-w-4xl text-sm leading-6 text-muted">
                    {role.purpose ||
                      role.description ||
                      "Formål er ikke beskrevet endnu."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {role.responsibilityAreas.map((area) => (
                      <StatusBadge key={area.id} tone="info">
                        {area.name}
                      </StatusBadge>
                    ))}
                    {role.committees.map((committee) => (
                      <StatusBadge key={committee.id} tone="neutral">
                        {committee.name}
                      </StatusBadge>
                    ))}
                  </div>
                </div>
                <ActionMenu>
                  <button
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-subtle"
                    disabled={pdfDownloadingId === role.id}
                    onClick={() => void downloadPdf(role)}
                    type="button"
                  >
                    {pdfDownloadingId === role.id
                      ? "Henter PDF..."
                      : "Download PDF"}
                  </button>
                  {data.canManage ? (
                    <>
                      <button
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-subtle"
                        disabled={aiLoadingId !== null}
                        onClick={() => void suggest(role)}
                        type="button"
                      >
                        {aiLoadingId === role.id
                          ? "Analyserer..."
                          : "Foreslå opdatering med AI"}
                      </button>
                      <button
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-subtle"
                        onClick={() => setDraft(fromRole(role))}
                        type="button"
                      >
                        Rediger jobkort
                      </button>
                    </>
                  ) : null}
                </ActionMenu>
              </div>
              <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <section>
                  <h3 className="text-sm font-semibold">Rolleholdere</h3>
                  {role.assignments.length ? (
                    <div className="mt-2 space-y-2">
                      {role.assignments.map((assignment) => (
                        <p className="text-sm" key={assignment.id}>
                          {assignment.name}
                          <span className="block text-xs text-muted">
                            {assignment.email}
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted">
                      Ingen er tilknyttet rollen.
                    </p>
                  )}
                </section>
                <section>
                  <h3 className="text-sm font-semibold">Opgaveskabeloner</h3>
                  {role.taskTemplates.length ? (
                    <div className="mt-2 space-y-2">
                      {role.taskTemplates.map((template) => (
                        <div
                          className="flex items-center justify-between gap-3"
                          key={template.id}
                        >
                          <span className="min-w-0 text-sm">
                            {template.title}
                          </span>
                          <Button
                            onClick={() => void instantiate(template.id)}
                            size="sm"
                            variant="secondary"
                          >
                            Opret opgave
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted">
                      Ingen skabeloner endnu.
                    </p>
                  )}
                </section>
                <section>
                  <h3 className="text-sm font-semibold">Dokumenter og links</h3>
                  {role.documents.length ? (
                    <div className="mt-2 space-y-2">
                      {role.documents.map((document) => (
                        <a
                          className="block truncate text-sm font-medium text-brand hover:underline"
                          href={document.url}
                          key={document.id}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {document.title}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted">
                      Ingen dokumenter tilknyttet.
                    </p>
                  )}
                </section>
              </div>
              <details className="mt-5 border-t border-line pt-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  Onboarding og rollekontekst
                </summary>
                <div className="mt-4 grid gap-5 lg:grid-cols-2">
                  <TextBlock
                    title="Introduktion"
                    value={role.onboardingGuide?.introduction}
                  />
                  <TextBlock
                    title="De første 30 dage"
                    value={role.onboardingGuide?.first_30_days}
                  />
                  <TextBlock
                    title="Praktisk information"
                    value={role.onboardingGuide?.practical_information}
                  />
                  <TextBlock title="Ansvar" value={role.responsibilities} />
                  <TextBlock title="Ikke ansvar for" value={role.exclusions} />
                  <TextBlock title="Samarbejde" value={role.collaboration} />
                  <TextBlock
                    title="Mødedeltagelse"
                    value={role.meeting_expectations}
                  />
                </div>
                <div className="mt-5 grid gap-5 lg:grid-cols-3">
                  <ContextList
                    empty="Ingen åbne opgaver."
                    items={role.relatedTasks
                      .filter(
                        (task) =>
                          !task.archived_at &&
                          !["completed", "cancelled"].includes(task.status),
                      )
                      .slice(0, 5)
                      .map((task) => ({
                        id: task.id,
                        title: task.title,
                        href: `/organizations/${organizationId}/tasks?editTask=${task.id}#task-${task.id}`,
                      }))}
                    title="Åbne opgaver"
                  />
                  <ContextList
                    empty="Ingen årshjulspunkter."
                    items={role.annualWheelEvents
                      .slice(0, 5)
                      .map((item) => ({
                        id: item.id,
                        title: `${item.starts_on} · ${item.title}`,
                        href: `/organizations/${organizationId}/annual-wheel`,
                      }))}
                    title="Årshjul"
                  />
                  <ContextList
                    empty="Ingen relevante beslutninger."
                    items={role.decisions.slice(0, 5).map((decision) => ({
                      id: decision.id,
                      title: decision.title,
                      href: `/organizations/${organizationId}/decisions#decision-${decision.id}`,
                    }))}
                    title="Historiske beslutninger"
                  />
                </div>
              </details>
            </article>
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              description="Prøv at ændre søgning eller filtre."
              title="Ingen jobkort matcher din søgning"
            />
          )}
        </>
      ) : (
        <EmptyState title="Der er endnu ikke oprettet jobkort i organisationen." />
      )}
      <RoleModal
        areaName={areaName}
        data={data}
        draft={draft}
        error={error}
        onAreaName={setAreaName}
        onArchive={archive}
        onClose={() => setDraft(null)}
        onCreateArea={createArea}
        onDraft={setDraft}
        onSubmit={submit}
        saving={saving}
      />
    </div>
  );
}

function TextBlock({ title, value }: { title: string; value?: string | null }) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted">
        {value || "Ikke beskrevet endnu."}
      </p>
    </section>
  );
}

function ContextList({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ id: string; title: string; href: string }>;
  empty: string;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length ? (
        <div className="mt-2 space-y-2">
          {items.map((item) => (
            <Link
              className="block truncate text-sm text-brand hover:underline"
              href={item.href}
              key={item.id}
            >
              {item.title}
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      )}
    </section>
  );
}

function RoleModal(props: {
  data: JobCardOverview; draft: RoleDraft | null; error: string | null; saving: boolean;
  areaName: string; onAreaName: (value: string) => void;
  onDraft: (draft: RoleDraft) => void; onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onArchive: (id: string) => void; onCreateArea: () => void;
}) {
  const { data, draft } = props;
  return (
    <Modal maxWidth="3xl" onClose={props.onClose} open={Boolean(draft)} title={draft?.id ? "Rediger jobkort" : "Opret jobkort"}>
      {draft ? <form className="space-y-6" onSubmit={props.onSubmit}>
        {props.error ? <div className="alert-danger p-3 text-sm">{props.error}</div> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titel"><Input value={draft.title} onChange={(e) => props.onDraft({ ...draft, title: e.target.value })} /></Field>
          <Field label="Formål"><Input value={draft.purpose} onChange={(e) => props.onDraft({ ...draft, purpose: e.target.value })} /></Field>
        </div>
        <Field label="Beskrivelse"><Textarea value={draft.description} onChange={(e) => props.onDraft({ ...draft, description: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Hvad rollen har ansvar for"><Textarea value={draft.responsibilities} onChange={(e) => props.onDraft({ ...draft, responsibilities: e.target.value })} /></Field>
          <Field label="Hvad rollen ikke har ansvar for"><Textarea value={draft.exclusions} onChange={(e) => props.onDraft({ ...draft, exclusions: e.target.value })} /></Field>
          <Field label="Kompetencer"><Textarea value={draft.competencies} onChange={(e) => props.onDraft({ ...draft, competencies: e.target.value })} /></Field>
          <Field label="Samarbejder med"><Textarea value={draft.collaboration} onChange={(e) => props.onDraft({ ...draft, collaboration: e.target.value })} /></Field>
          <Field label="Normale møder"><Textarea value={draft.meetingExpectations} onChange={(e) => props.onDraft({ ...draft, meetingExpectations: e.target.value })} /></Field>
          <Field label="Kontaktpersoner"><Textarea value={draft.contactPeople} onChange={(e) => props.onDraft({ ...draft, contactPeople: e.target.value })} /></Field>
        </div>
        <ChoiceGroup label="Ansvarsområder" options={data.responsibilityAreas.map((area) => ({ id: area.id, label: area.name }))} values={draft.responsibilityAreaIds} onToggle={(id) => props.onDraft({ ...draft, responsibilityAreaIds: toggle(draft.responsibilityAreaIds, id) })} />
        {draft.responsibilityAreaNames.length ? (
          <div className="flex flex-wrap gap-2">
            {draft.responsibilityAreaNames.map((name) => (
              <button
                className="rounded border border-brand/30 bg-brand-soft px-3 py-1 text-sm text-brand"
                key={normalizeAreaName(name)}
                onClick={() => props.onDraft({
                  ...draft,
                  responsibilityAreaNames: draft.responsibilityAreaNames.filter(
                    (current) => normalizeAreaName(current) !== normalizeAreaName(name),
                  ),
                })}
                type="button"
              >
                {name} x
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2"><Input list="job-card-responsibility-areas" placeholder="Skriv nyt eller eksisterende ansvarsområde" value={props.areaName} onChange={(e) => props.onAreaName(e.target.value)} /><datalist id="job-card-responsibility-areas">{data.responsibilityAreas.map((area) => <option key={area.id} value={area.name} />)}</datalist><Button disabled={!props.areaName.trim()} onClick={props.onCreateArea} type="button" variant="secondary">Tilføj område</Button></div>
        <ChoiceGroup label="Udvalg" options={data.committees.map((committee) => ({ id: committee.id, label: committee.name }))} values={draft.committeeIds} onToggle={(id) => props.onDraft({ ...draft, committeeIds: toggle(draft.committeeIds, id) })} />
        <ChoiceGroup label="Rolleholdere" options={data.members.filter((member) => member.status === "active").map((member) => ({ id: member.user_id, label: member.full_name || member.email }))} values={draft.assignedUserIds} onToggle={(id) => props.onDraft({ ...draft, assignedUserIds: toggle(draft.assignedUserIds, id) })} />
        <details className="border-y border-line py-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Relationer
            <span className="ml-2 font-normal text-muted">
              ({draft.annualWheelEventIds.length + draft.decisionIds.length})
            </span>
          </summary>
          <div className="mt-4 space-y-5">
            <RelationChoiceGroup
              empty="Ingen årshjulsaktiviteter er tilgængelige."
              label="Årshjulsaktiviteter"
              onToggle={(id) =>
                props.onDraft({
                  ...draft,
                  annualWheelEventIds: toggle(
                    draft.annualWheelEventIds,
                    id,
                  ),
                })
              }
              options={data.annualWheelEvents.map((event) => ({
                id: event.id,
                label: event.title,
                meta: `${event.starts_on} · ${
                  event.committee?.name ?? "Hele organisationen"
                }`,
              }))}
              values={draft.annualWheelEventIds}
            />
            <RelationChoiceGroup
              empty="Ingen beslutninger er tilgængelige."
              label="Beslutninger"
              onToggle={(id) =>
                props.onDraft({
                  ...draft,
                  decisionIds: toggle(draft.decisionIds, id),
                })
              }
              options={data.decisions.map((decision) => ({
                id: decision.id,
                label: decision.title,
                meta: `${decision.decision_date} · ${
                  data.committees.find(
                    (committee) => committee.id === decision.committee_id,
                  )?.name ?? "Udvalg"
                }`,
              }))}
              values={draft.decisionIds}
            />
          </div>
        </details>
        <DynamicDocuments draft={draft} onDraft={props.onDraft} />
        <DynamicTemplates data={data} draft={draft} onDraft={props.onDraft} />
        <div className="border-t border-line pt-5"><h3 className="font-semibold">Onboarding</h3><div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Introduktion til rollen"><Textarea value={draft.onboarding.introduction} onChange={(e) => props.onDraft({ ...draft, onboarding: { ...draft.onboarding, introduction: e.target.value } })} /></Field>
          <Field label="Prioriterede opgaver de første 30 dage"><Textarea value={draft.onboarding.first30Days} onChange={(e) => props.onDraft({ ...draft, onboarding: { ...draft.onboarding, first30Days: e.target.value } })} /></Field>
          <Field label="Praktisk information"><Textarea value={draft.onboarding.practicalInformation} onChange={(e) => props.onDraft({ ...draft, onboarding: { ...draft.onboarding, practicalInformation: e.target.value } })} /></Field>
        </div></div>
        <div className="flex justify-between gap-3">{draft.id ? <Button onClick={() => props.onArchive(draft.id!)} type="button" variant="danger">Arkivér</Button> : <span />}<div className="flex gap-2"><Button onClick={props.onClose} type="button" variant="secondary">Annuller</Button><Button disabled={props.saving} type="submit">{props.saving ? "Gemmer..." : "Gem jobkort"}</Button></div></div>
      </form> : null}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="label">{label}</span>{children}</label>; }
function ChoiceGroup({ label, options, values, onToggle }: { label: string; options: Array<{ id: string; label: string }>; values: string[]; onToggle: (id: string) => void }) { return <fieldset><legend className="label">{label}</legend><div className="mt-2 flex flex-wrap gap-2">{options.length ? options.map((option) => <label className="flex items-center gap-2 rounded border border-line px-3 py-2 text-sm" key={option.id}><input checked={values.includes(option.id)} onChange={() => onToggle(option.id)} type="checkbox" />{option.label}</label>) : <span className="text-sm text-muted">Ingen valgmuligheder endnu.</span>}</div></fieldset>; }

function RelationChoiceGroup({
  empty,
  label,
  onToggle,
  options,
  values,
}: {
  empty: string;
  label: string;
  onToggle: (id: string) => void;
  options: Array<{ id: string; label: string; meta: string }>;
  values: string[];
}) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      {options.length ? (
        <div className="mt-2 max-h-56 divide-y divide-line overflow-y-auto border-y border-line">
          {options.map((option) => (
            <label
              className="flex cursor-pointer items-start gap-3 px-2 py-2.5 hover:bg-subtle/60"
              key={option.id}
            >
              <input
                checked={values.includes(option.id)}
                className="mt-1"
                onChange={() => onToggle(option.id)}
                type="checkbox"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {option.label}
                </span>
                <span className="block truncate text-xs text-muted">
                  {option.meta}
                </span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      )}
    </fieldset>
  );
}

function DynamicDocuments({ draft, onDraft }: { draft: RoleDraft; onDraft: (draft: RoleDraft) => void }) {
  return <section><div className="flex items-center justify-between"><h3 className="font-semibold">Dokumenter og links</h3><Button onClick={() => onDraft({ ...draft, documents: [...draft.documents, { title: "", url: "" }] })} size="sm" type="button" variant="secondary">Tilføj link</Button></div><div className="mt-3 space-y-3">{draft.documents.map((document, index) => <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]" key={index}><Input placeholder="Titel" value={document.title} onChange={(e) => onDraft({ ...draft, documents: draft.documents.map((item, i) => i === index ? { ...item, title: e.target.value } : item) })} /><Input placeholder="https://..." value={document.url} onChange={(e) => onDraft({ ...draft, documents: draft.documents.map((item, i) => i === index ? { ...item, url: e.target.value } : item) })} /><Button onClick={() => onDraft({ ...draft, documents: draft.documents.filter((_, i) => i !== index) })} type="button" variant="ghost">Fjern</Button></div>)}</div></section>;
}

function DynamicTemplates({ data, draft, onDraft }: { data: JobCardOverview; draft: RoleDraft; onDraft: (draft: RoleDraft) => void }) {
  return <section><div className="flex items-center justify-between"><h3 className="font-semibold">Opgaveskabeloner</h3><Button onClick={() => onDraft({ ...draft, taskTemplates: [...draft.taskTemplates, { committeeId: draft.committeeIds[0] || data.committees[0]?.id || "", title: "", description: "", category: "", defaultDeadlineDays: null }] })} size="sm" type="button" variant="secondary">Tilføj skabelon</Button></div><div className="mt-3 space-y-4">{draft.taskTemplates.map((template, index) => <div className="rounded border border-line p-3" key={index}><div className="grid gap-3 sm:grid-cols-2"><Field label="Titel"><Input value={template.title} onChange={(e) => onDraft({ ...draft, taskTemplates: draft.taskTemplates.map((item, i) => i === index ? { ...item, title: e.target.value } : item) })} /></Field><Field label="Udvalg"><select className="field" value={template.committeeId} onChange={(e) => onDraft({ ...draft, taskTemplates: draft.taskTemplates.map((item, i) => i === index ? { ...item, committeeId: e.target.value } : item) })}>{data.committees.map((committee) => <option key={committee.id} value={committee.id}>{committee.name}</option>)}</select></Field><Field label="Kategori"><Input value={template.category} onChange={(e) => onDraft({ ...draft, taskTemplates: draft.taskTemplates.map((item, i) => i === index ? { ...item, category: e.target.value } : item) })} /></Field><Field label="Deadline efter antal dage"><Input min={0} type="number" value={template.defaultDeadlineDays ?? ""} onChange={(e) => onDraft({ ...draft, taskTemplates: draft.taskTemplates.map((item, i) => i === index ? { ...item, defaultDeadlineDays: e.target.value ? Number(e.target.value) : null } : item) })} /></Field></div><Field label="Beskrivelse"><Textarea value={template.description} onChange={(e) => onDraft({ ...draft, taskTemplates: draft.taskTemplates.map((item, i) => i === index ? { ...item, description: e.target.value } : item) })} /></Field><Button className="mt-2" onClick={() => onDraft({ ...draft, taskTemplates: draft.taskTemplates.filter((_, i) => i !== index) })} type="button" variant="ghost">Fjern skabelon</Button></div>)}</div></section>;
}
