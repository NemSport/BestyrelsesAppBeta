"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
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
  committeeIds: string[];
  assignedUserIds: string[];
  documents: DocumentDraft[];
  taskTemplates: TemplateDraft[];
  onboarding: {
    introduction: string;
    first30Days: string;
    practicalInformation: string;
  };
};
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
    committeeIds: [],
    assignedUserIds: [],
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
    committeeIds: role.committees.map((committee) => committee.id),
    assignedUserIds: role.assignments.map((assignment) => assignment.userId),
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
  const [creatingArea, setCreatingArea] = useState(false);
  const [taskMessage, setTaskMessage] = useState<string | null>(null);
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [pdfDownloadingId, setPdfDownloadingId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    const response = await fetch(
      draft.id
        ? `/api/job-cards/${draft.id}`
        : `/api/organizations/${organizationId}/job-cards`,
      {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          ...draft,
          taskTemplates: draft.taskTemplates.map((template) => ({
            ...template,
            category: template.category || null,
          })),
        }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(payload.error ?? "Jobkortet kunne ikke gemmes.");
      return;
    }
    setDraft(null);
    router.refresh();
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

  async function createArea() {
    if (!areaName.trim()) return;
    setCreatingArea(true);
    const response = await fetch(
      `/api/organizations/${organizationId}/responsibility-areas`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          name: areaName,
          description: "",
        }),
      },
    );
    setCreatingArea(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "Ansvarsområdet kunne ikke oprettes.");
      return;
    }
    setAreaName("");
    router.refresh();
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
        value.toLocaleLowerCase("da-DK"),
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
          normalizedAreas.has(area.name.toLocaleLowerCase("da-DK")),
        )
        .map((area) => area.id),
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
    <div className="space-y-8">
      {data.roles.some((role) =>
        role.assignments.some(
          (assignment) => assignment.userId === data.currentUserId,
        ),
      ) ? (
        <section className="rounded-[var(--radius-panel)] border border-brand/20 bg-brand-soft p-5">
          <p className="page-eyebrow">Din onboarding</p>
          <h2 className="mt-1 text-lg font-semibold">
            Roller du aktuelt varetager
          </h2>
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
                  className="button-secondary"
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
            <Button
              disabled={aiLoadingId !== null}
              onClick={() => void suggest()}
              variant="secondary"
            >
              {aiLoadingId === "new" ? "Analyserer..." : "Foreslå jobkort med AI"}
            </Button>
            <Button onClick={() => setDraft(emptyDraft())}>Opret jobkort</Button>
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
        <div className="space-y-4">
          {data.roles.map((role) => (
            <article className="panel p-5" id={`job-card-${role.id}`} key={role.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="page-eyebrow">Jobkort</p>
                  <h2 className="mt-1 text-xl font-semibold">{role.title}</h2>
                  <p className="mt-2 max-w-3xl text-sm text-muted">
                    {role.purpose || role.description || "Formål er ikke beskrevet endnu."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {role.responsibilityAreas.map((area) => (
                      <StatusBadge key={area.id} tone="info">{area.name}</StatusBadge>
                    ))}
                    {role.committees.map((committee) => (
                      <StatusBadge key={committee.id} tone="neutral">{committee.name}</StatusBadge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={pdfDownloadingId === role.id}
                    onClick={() => void downloadPdf(role)}
                    variant="secondary"
                  >
                    {pdfDownloadingId === role.id
                      ? "Henter PDF..."
                      : "Download PDF"}
                  </Button>
                  {data.canManage ? (
                    <>
                    <Button
                      disabled={aiLoadingId !== null}
                      onClick={() => void suggest(role)}
                      variant="ghost"
                    >
                      {aiLoadingId === role.id
                        ? "Analyserer..."
                        : "Foreslå opdatering"}
                    </Button>
                    <Button onClick={() => setDraft(fromRole(role))} variant="secondary">
                      Rediger
                    </Button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <section>
                  <h3 className="text-sm font-semibold">Rolleholdere</h3>
                  {role.assignments.length ? role.assignments.map((assignment) => (
                    <p className="mt-2 text-sm" key={assignment.id}>
                      {assignment.name}<span className="block text-xs text-muted">{assignment.email}</span>
                    </p>
                  )) : <p className="mt-2 text-sm text-muted">Ingen er tilknyttet rollen.</p>}
                </section>
                <section>
                  <h3 className="text-sm font-semibold">Opgaveskabeloner</h3>
                  {role.taskTemplates.length ? role.taskTemplates.map((template) => (
                    <div className="mt-2 flex items-center justify-between gap-3" key={template.id}>
                      <span className="text-sm">{template.title}</span>
                      <Button onClick={() => void instantiate(template.id)} size="sm" variant="secondary">
                        Opret opgave
                      </Button>
                    </div>
                  )) : <p className="mt-2 text-sm text-muted">Ingen skabeloner endnu.</p>}
                </section>
                <section>
                  <h3 className="text-sm font-semibold">Dokumenter og links</h3>
                  {role.documents.length ? role.documents.map((document) => (
                    <a className="mt-2 block text-sm font-medium text-brand hover:underline" href={document.url} key={document.id} rel="noreferrer" target="_blank">
                      {document.title}
                    </a>
                  )) : <p className="mt-2 text-sm text-muted">Ingen dokumenter tilknyttet.</p>}
                </section>
              </div>
              <details className="mt-5 border-t border-line pt-4">
                <summary className="cursor-pointer font-semibold">Onboarding og rollekontekst</summary>
                <div className="mt-4 grid gap-5 lg:grid-cols-2">
                  <TextBlock title="Introduktion" value={role.onboardingGuide?.introduction} />
                  <TextBlock title="De første 30 dage" value={role.onboardingGuide?.first_30_days} />
                  <TextBlock title="Ansvar" value={role.responsibilities} />
                  <TextBlock title="Ikke ansvar for" value={role.exclusions} />
                  <TextBlock title="Samarbejde" value={role.collaboration} />
                  <TextBlock title="Mødedeltagelse" value={role.meeting_expectations} />
                </div>
                <div className="mt-5 grid gap-5 lg:grid-cols-3">
                  <ContextList title="Åbne opgaver" empty="Ingen åbne opgaver." items={role.relatedTasks.filter((task) => !task.archived_at && !["completed","cancelled"].includes(task.status)).slice(0,5).map((task) => ({ id: task.id, title: task.title, href: `/organizations/${organizationId}/tasks#task-${task.id}` }))} />
                  <ContextList title="Årshjul" empty="Ingen årshjulspunkter." items={role.annualWheelEvents.slice(0,5).map((item) => ({ id: item.id, title: `${item.starts_on} · ${item.title}`, href: `/organizations/${organizationId}/annual-wheel` }))} />
                  <ContextList title="Historiske beslutninger" empty="Ingen relevante beslutninger." items={role.decisions.slice(0,5).map((decision) => ({ id: decision.id, title: decision.title, href: `/organizations/${organizationId}/decisions#decision-${decision.id}` }))} />
                </div>
              </details>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="Der er endnu ikke oprettet jobkort i organisationen." />
      )}
      <RoleModal
        areaName={areaName}
        creatingArea={creatingArea}
        data={data}
        draft={draft}
        error={error}
        onAreaName={setAreaName}
        onArchive={archive}
        onClose={() => setDraft(null)}
        onCreateArea={() => void createArea()}
        onDraft={setDraft}
        onSubmit={submit}
        saving={saving}
      />
    </div>
  );
}

function TextBlock({ title, value }: { title: string; value?: string | null }) {
  return <section><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{value || "Ikke beskrevet endnu."}</p></section>;
}

function ContextList({ title, items, empty }: { title: string; items: Array<{ id: string; title: string; href: string }>; empty: string }) {
  return <section><h3 className="text-sm font-semibold">{title}</h3>{items.length ? items.map((item) => <Link className="mt-2 block text-sm text-brand hover:underline" href={item.href} key={item.id}>{item.title}</Link>) : <p className="mt-2 text-sm text-muted">{empty}</p>}</section>;
}

function RoleModal(props: {
  data: JobCardOverview; draft: RoleDraft | null; error: string | null; saving: boolean;
  areaName: string; creatingArea: boolean; onAreaName: (value: string) => void;
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
        <div className="flex gap-2"><Input placeholder="Nyt ansvarsområde" value={props.areaName} onChange={(e) => props.onAreaName(e.target.value)} /><Button disabled={props.creatingArea} onClick={props.onCreateArea} type="button" variant="secondary">Tilføj område</Button></div>
        <ChoiceGroup label="Udvalg" options={data.committees.map((committee) => ({ id: committee.id, label: committee.name }))} values={draft.committeeIds} onToggle={(id) => props.onDraft({ ...draft, committeeIds: toggle(draft.committeeIds, id) })} />
        <ChoiceGroup label="Rolleholdere" options={data.members.filter((member) => member.status === "active").map((member) => ({ id: member.user_id, label: member.full_name || member.email }))} values={draft.assignedUserIds} onToggle={(id) => props.onDraft({ ...draft, assignedUserIds: toggle(draft.assignedUserIds, id) })} />
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

function DynamicDocuments({ draft, onDraft }: { draft: RoleDraft; onDraft: (draft: RoleDraft) => void }) {
  return <section><div className="flex items-center justify-between"><h3 className="font-semibold">Dokumenter og links</h3><Button onClick={() => onDraft({ ...draft, documents: [...draft.documents, { title: "", url: "" }] })} size="sm" type="button" variant="secondary">Tilføj link</Button></div><div className="mt-3 space-y-3">{draft.documents.map((document, index) => <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]" key={index}><Input placeholder="Titel" value={document.title} onChange={(e) => onDraft({ ...draft, documents: draft.documents.map((item, i) => i === index ? { ...item, title: e.target.value } : item) })} /><Input placeholder="https://..." value={document.url} onChange={(e) => onDraft({ ...draft, documents: draft.documents.map((item, i) => i === index ? { ...item, url: e.target.value } : item) })} /><Button onClick={() => onDraft({ ...draft, documents: draft.documents.filter((_, i) => i !== index) })} type="button" variant="ghost">Fjern</Button></div>)}</div></section>;
}

function DynamicTemplates({ data, draft, onDraft }: { data: JobCardOverview; draft: RoleDraft; onDraft: (draft: RoleDraft) => void }) {
  return <section><div className="flex items-center justify-between"><h3 className="font-semibold">Opgaveskabeloner</h3><Button onClick={() => onDraft({ ...draft, taskTemplates: [...draft.taskTemplates, { committeeId: draft.committeeIds[0] || data.committees[0]?.id || "", title: "", description: "", category: "", defaultDeadlineDays: null }] })} size="sm" type="button" variant="secondary">Tilføj skabelon</Button></div><div className="mt-3 space-y-4">{draft.taskTemplates.map((template, index) => <div className="rounded border border-line p-3" key={index}><div className="grid gap-3 sm:grid-cols-2"><Field label="Titel"><Input value={template.title} onChange={(e) => onDraft({ ...draft, taskTemplates: draft.taskTemplates.map((item, i) => i === index ? { ...item, title: e.target.value } : item) })} /></Field><Field label="Udvalg"><select className="field" value={template.committeeId} onChange={(e) => onDraft({ ...draft, taskTemplates: draft.taskTemplates.map((item, i) => i === index ? { ...item, committeeId: e.target.value } : item) })}>{data.committees.map((committee) => <option key={committee.id} value={committee.id}>{committee.name}</option>)}</select></Field><Field label="Kategori"><Input value={template.category} onChange={(e) => onDraft({ ...draft, taskTemplates: draft.taskTemplates.map((item, i) => i === index ? { ...item, category: e.target.value } : item) })} /></Field><Field label="Deadline efter antal dage"><Input min={0} type="number" value={template.defaultDeadlineDays ?? ""} onChange={(e) => onDraft({ ...draft, taskTemplates: draft.taskTemplates.map((item, i) => i === index ? { ...item, defaultDeadlineDays: e.target.value ? Number(e.target.value) : null } : item) })} /></Field></div><Field label="Beskrivelse"><Textarea value={template.description} onChange={(e) => onDraft({ ...draft, taskTemplates: draft.taskTemplates.map((item, i) => i === index ? { ...item, description: e.target.value } : item) })} /></Field><Button className="mt-2" onClick={() => onDraft({ ...draft, taskTemplates: draft.taskTemplates.filter((_, i) => i !== index) })} type="button" variant="ghost">Fjern skabelon</Button></div>)}</div></section>;
}
