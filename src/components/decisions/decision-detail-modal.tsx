"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  Button,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { useUnsavedChanges } from "@/hooks/use-mutation-feedback";
import {
  decisionStatusLabels,
  decisionStatusOptions,
  decisionStatusTones,
  type DecisionStatus,
} from "@/lib/decisions";
import type { DecisionView } from "@/types/domain";

type DecisionModalDraft = {
  title: string;
  description: string;
  status: DecisionStatus;
  responsibleUserId: string;
  decisionDate: string;
  deadline: string;
  category: string;
  internalNote: string;
};

function draftFromDecision(decision: DecisionView): DecisionModalDraft {
  return {
    title: decision.title,
    description: decision.description,
    status: decision.status,
    responsibleUserId: decision.responsible_user_id ?? "",
    decisionDate: decision.decision_date,
    deadline: decision.deadline ?? "",
    category: decision.category ?? "",
    internalNote: decision.internal_note ?? "",
  };
}

export function DecisionDetailModal({
  canEdit,
  decision,
  onClose,
  onUpdated,
  open,
  organizationId,
  responsiblePeople,
}: {
  canEdit: boolean;
  decision: DecisionView;
  onClose: () => void;
  onUpdated: (decision: DecisionView) => void;
  open: boolean;
  organizationId: string;
  responsiblePeople: Array<{ id: string; name: string }>;
}) {
  const [draft, setDraft] = useState(() => draftFromDecision(decision));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(draftFromDecision(decision));
  const confirmDiscard = useUnsavedChanges(
    open && dirty && !saving,
    "Du har ændringer i beslutningen, som ikke er gemt. Vil du lukke uden at gemme?",
  );

  useEffect(() => {
    setDraft(draftFromDecision(decision));
    setError(null);
    setMessage(null);
  }, [decision]);

  function closeModal() {
    if (saving || !confirmDiscard()) return;
    onClose();
  }

  function updateDraft<Key extends keyof DecisionModalDraft>(
    key: Key,
    value: DecisionModalDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
    setMessage(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/decisions/${decision.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          committeeId: decision.committee_id,
          meetingId: decision.meeting_id,
          agendaItemId: decision.agenda_item_id,
          title: draft.title,
          description: draft.description,
          status: draft.status,
          responsibleUserId: draft.responsibleUserId || null,
          decisionDate: draft.decisionDate,
          deadline: draft.deadline || null,
          category: draft.category || null,
          internalNote: draft.internalNote || null,
        }),
      });
      const result = (await response.json()) as Partial<DecisionView> & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "Beslutningen kunne ikke gemmes.");
      }
      const responsible = responsiblePeople.find(
        (person) => person.id === draft.responsibleUserId,
      );
      onUpdated({
        ...decision,
        ...result,
        title: draft.title,
        description: draft.description,
        status: draft.status,
        responsible_user_id: draft.responsibleUserId || null,
        responsible: responsible
          ? { id: responsible.id, full_name: responsible.name }
          : null,
        decision_date: draft.decisionDate,
        deadline: draft.deadline || null,
        category: draft.category || null,
        internal_note: draft.internalNote || null,
      });
      setMessage("Beslutningen er opdateret.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Beslutningen kunne ikke gemmes.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function performAction(action: "archive" | "cancel") {
    const question =
      action === "archive"
        ? `Vil du arkivere “${decision.title}”?`
        : `Vil du annullere “${decision.title}”?`;
    if (!window.confirm(question)) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/decisions/${decision.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action }),
      });
      const result = (await response.json()) as Partial<DecisionView> & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "Handlingen kunne ikke gennemføres.");
      }
      onUpdated({ ...decision, ...result });
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Handlingen kunne ikke gennemføres.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      description="Beslutningens møde- og dagsordensrelation bevares."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {canEdit && !decision.archived_at ? (
              <Button
                disabled={saving}
                onClick={() => void performAction("archive")}
                variant="ghost"
              >
                Arkivér
              </Button>
            ) : null}
            {canEdit && decision.status !== "cancelled" ? (
              <Button
                disabled={saving}
                onClick={() => void performAction("cancel")}
                variant="ghost"
              >
                Annullér beslutning
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button disabled={saving} onClick={closeModal} variant="secondary">
              Luk
            </Button>
            {canEdit ? (
              <Button
                disabled={saving}
                form={`related-decision-${decision.id}`}
                type="submit"
              >
                {saving ? "Gemmer…" : "Gem beslutning"}
              </Button>
            ) : null}
          </div>
        </div>
      }
      maxWidth="3xl"
      onClose={closeModal}
      open={open}
      title={decision.title}
    >
      <div className="space-y-4 overflow-x-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={decisionStatusTones[draft.status]}>
            {decisionStatusLabels[draft.status]}
          </StatusBadge>
          {!canEdit ? <StatusBadge>Kun læseadgang</StatusBadge> : null}
          {decision.archived_at ? <StatusBadge>Arkiveret</StatusBadge> : null}
        </div>
        {error ? (
          <p className="alert-danger px-3 py-2 text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="alert-success px-3 py-2 text-sm" role="status">
            {message}
          </p>
        ) : null}
        <form
          className="space-y-4"
          id={`related-decision-${decision.id}`}
          onSubmit={save}
        >
          <div>
            <label className="label" htmlFor={`related-decision-title-${decision.id}`}>
              Titel
            </label>
            <Input
              disabled={!canEdit}
              id={`related-decision-title-${decision.id}`}
              maxLength={240}
              onChange={(event) => updateDraft("title", event.target.value)}
              required
              value={draft.title}
            />
          </div>
          <div>
            <label
              className="label"
              htmlFor={`related-decision-description-${decision.id}`}
            >
              Beskrivelse
            </label>
            <Textarea
              className="min-h-28"
              disabled={!canEdit}
              id={`related-decision-description-${decision.id}`}
              maxLength={20000}
              onChange={(event) =>
                updateDraft("description", event.target.value)
              }
              value={draft.description}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor={`related-decision-status-${decision.id}`}>
                Status
              </label>
              <Select
                disabled={!canEdit}
                id={`related-decision-status-${decision.id}`}
                onChange={(event) =>
                  updateDraft("status", event.target.value as DecisionStatus)
                }
                value={draft.status}
              >
                {decisionStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label
                className="label"
                htmlFor={`related-decision-responsible-${decision.id}`}
              >
                Ansvarlig
              </label>
              <Select
                disabled={!canEdit}
                id={`related-decision-responsible-${decision.id}`}
                onChange={(event) =>
                  updateDraft("responsibleUserId", event.target.value)
                }
                value={draft.responsibleUserId}
              >
                <option value="">Ingen ansvarlig</option>
                {responsiblePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="label" htmlFor={`related-decision-date-${decision.id}`}>
                Beslutningsdato
              </label>
              <Input
                disabled={!canEdit}
                id={`related-decision-date-${decision.id}`}
                onChange={(event) =>
                  updateDraft("decisionDate", event.target.value)
                }
                type="date"
                value={draft.decisionDate}
              />
            </div>
            <div>
              <label
                className="label"
                htmlFor={`related-decision-deadline-${decision.id}`}
              >
                Deadline
              </label>
              <Input
                disabled={!canEdit}
                id={`related-decision-deadline-${decision.id}`}
                onChange={(event) => updateDraft("deadline", event.target.value)}
                type="date"
                value={draft.deadline}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`related-decision-category-${decision.id}`}>
                Kategori
              </label>
              <Input
                disabled={!canEdit}
                id={`related-decision-category-${decision.id}`}
                onChange={(event) => updateDraft("category", event.target.value)}
                value={draft.category}
              />
            </div>
            {canEdit ? (
              <div>
                <label className="label" htmlFor={`related-decision-note-${decision.id}`}>
                  Intern note
                </label>
                <Textarea
                  className="min-h-20"
                  id={`related-decision-note-${decision.id}`}
                  maxLength={10000}
                  onChange={(event) =>
                    updateDraft("internalNote", event.target.value)
                  }
                  value={draft.internalNote}
                />
              </div>
            ) : null}
          </div>
        </form>
      </div>
    </Modal>
  );
}
