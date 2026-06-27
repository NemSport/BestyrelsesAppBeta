"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";

import { AgendaItemDocumentTitle } from "@/components/agenda-items/agenda-item-document-title";
import { EditAgendaItemModal } from "@/components/agenda-items/edit-agenda-item-modal";
import { DecisionCreateModal } from "@/components/decisions/decision-create-modal";
import { DecisionHistory } from "@/components/decisions/decision-history";
import { RelatedDecisions } from "@/components/decisions/related-decisions";
import { RelatedTasks } from "@/components/tasks/related-tasks";
import { AiTaskReviewModal } from "@/components/tasks/ai-task-review-modal";
import { TaskCreateModal } from "@/components/tasks/task-create-modal";
import { TrashActionButton } from "@/components/trash/trash-action-button";
import { RichTextContent } from "@/components/forms/rich-text-content";
import { RichTextEditor } from "@/components/forms/rich-text-editor";
import {
  AutosaveStatusLine,
  LocalDraftConflict,
} from "@/components/meetings/autosave-feedback";
import { MinutesAiAssistant } from "@/components/meetings/minutes-ai-assistant";
import {
  MinuteAttachments,
  MinutesApprovalPanel,
} from "@/components/meetings/minutes-governance";
import { PreviousMinutesReference } from "@/components/meetings/previous-minutes-reference";
import {
  ActionBar,
  Button,
  DocumentPanel,
  EmptyState,
  Input,
  Modal,
  Select,
  StatusBadge,
  type StatusTone,
} from "@/components/ui";
import { useOfflineAutosave } from "@/hooks/use-offline-autosave";
import {
  agendaItemMinutesNeedsAction,
  agendaItemMinutesStatusOptions,
  normalizeAgendaItemMinutesStatus,
  shouldSuggestAgendaItemTransfer,
} from "@/lib/agenda-item-minutes";
import {
  agendaItemMinutesStatusLabels,
  formatDate,
  meetingMinutesStatusLabels,
  standardAgendaItemLabels,
} from "@/lib/localization";
import { firstRichTextToPlainText } from "@/lib/rich-text";
import type { Database } from "@/types/database";
import type {
  AgendaItemMinutes,
  AgendaItemPrivateNote,
  DecisionView,
  MeetingMinutes,
  MeetingMinutesReferentLock,
  MeetingWithAgenda,
  MinutesResponsiblePerson,
  MeetingMinuteApprovalView,
  MinuteAttachmentView,
  PreviousMeetingMinutesReference,
  TaskView,
} from "@/types/domain";

type MinutesStatus = Database["public"]["Enums"]["meeting_minutes_status"];
type AgendaMinutesStatus =
  Database["public"]["Enums"]["agenda_item_minutes_status"];
type AgendaOccurrence = MeetingWithAgenda["agenda_item_occurrences"][number];
type FieldErrors = Record<string, string[] | undefined>;
type AgendaActionPanel = "followUp" | "privateNote" | "more" | null;
type AgendaMinutesDraft = {
  notes: string;
  decision: string;
  followUp: string;
  responsibleUserId: string;
  deadline: string;
  status: AgendaMinutesStatus;
};

type AgendaPrivateNoteDraft = {
  content: string;
};

type MeetingMinutesDraft = {
  minutesText: string;
  decisions: string;
  internalNote: string;
  status: MinutesStatus;
};

type MeetingMinutesReferentLockView = MeetingMinutesReferentLock & {
  memberName: string;
  memberEmail: string;
  isCurrentUser: boolean;
  isExpired: boolean;
  claimed?: boolean;
};

function isNewerServerVersion(
  serverUpdatedAt: string,
  localUpdatedAt: string | null | undefined,
) {
  if (!localUpdatedAt) return true;
  return Date.parse(serverUpdatedAt) > Date.parse(localUpdatedAt);
}

const agendaMinutesFieldGuidance = {
  information: {
    notes: "Hvad blev der orienteret om?",
    decision: null,
    followUp: "Skal noget følges op eller tages op igen senere?",
  },
  discussion: {
    notes: "Hvad blev drøftet, og hvilke hovedsynspunkter kom frem?",
    decision:
      "Skriv kun en konklusion, hvis drøftelsen førte til noget konkret.",
    followUp:
      "Skal punktet fortsætte, blive til en beslutning eller følges op?",
  },
  decision: {
    notes: "Skriv kort baggrund eller væsentlige bemærkninger.",
    decision: "Skriv den konkrete beslutning eller udfaldet.",
    followUp: "Skriv hvad beslutningen kræver af handling efter mødet.",
  },
  follow_up: {
    notes: "Hvad blev der fulgt op på?",
    decision: "Skriv resultatet eller status på opfølgningen.",
    followUp: "Skriv hvad der stadig mangler, eller hvad der skal videreføres.",
  },
} as const;

const meetingStatusTones: Record<MinutesStatus, StatusTone> = {
  draft: "neutral",
  ready_for_approval: "warning",
  approved: "success",
};

const agendaStatusTones: Record<AgendaMinutesStatus, StatusTone> = {
  not_started: "neutral",
  in_progress: "info",
  needs_decision: "warning",
  needs_responsible: "warning",
  completed: "success",
  information_oriented: "success",
  information_requires_follow_up: "warning",
  information_revisit: "progress",
  discussion_completed: "success",
  discussion_continue: "progress",
  decision_approved: "success",
  decision_rejected: "danger",
  decision_deferred: "progress",
  decision_requires_follow_up: "warning",
  follow_up_completed: "success",
  deadline_changed: "info",
  follow_up_continued: "progress",
};

async function readResponse<T>(response: Response) {
  const result = (await response.json()) as T & {
    error?: string;
    code?: string;
    fieldErrors?: FieldErrors;
  };
  if (!response.ok) {
    throw Object.assign(
      new Error(result.error || "Referatet kunne ikke gemmes."),
      { code: result.code, fieldErrors: result.fieldErrors || {} },
    );
  }
  return result;
}

function EmptyValue() {
  return <span className="text-slate-500">Ikke angivet</span>;
}

function isActiveReferentLock(
  lock: MeetingMinutesReferentLockView | null,
  now = Date.now(),
) {
  return Boolean(lock && !lock.isExpired && Date.parse(lock.expires_at) > now);
}

function ReferentRoleControl({
  organizationId,
  committeeId,
  meetingId,
  canEdit,
  referentLock,
  onChange,
}: {
  organizationId: string;
  committeeId: string;
  meetingId: string;
  canEdit: boolean;
  referentLock: MeetingMinutesReferentLockView | null;
  onChange: (lock: MeetingMinutesReferentLockView | null) => void;
}) {
  const [pendingAction, setPendingAction] = useState<
    "claim" | "release" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const activeLock = isActiveReferentLock(referentLock, now)
    ? referentLock
    : null;
  const isCurrentReferent = Boolean(activeLock?.isCurrentUser);

  const sendReferentAction = useCallback(async (action: "claim" | "heartbeat" | "release") => {
    const result = await readResponse<{
      lock: MeetingMinutesReferentLockView | null;
      claimed: boolean;
      message: string;
    }>(
      await fetch(`/api/meetings/${meetingId}/minutes/referent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          committeeId,
          action,
        }),
      }),
    );
    onChange(result.lock);
    return result;
  }, [committeeId, meetingId, onChange, organizationId]);

  async function handleAction(action: "claim" | "release") {
    setPendingAction(action);
    setMessage(null);
    setError(null);
    try {
      const result = await sendReferentAction(action);
      setMessage(result.message);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Referentrollen kunne ikke opdateres.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  useEffect(() => {
    if (!referentLock) return;

    const interval = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(interval);
  }, [referentLock]);

  useEffect(() => {
    if (!canEdit || !isCurrentReferent) return;

    let cancelled = false;
    async function heartbeat() {
      try {
        const result = await sendReferentAction("heartbeat");
        if (!cancelled) {
          onChange(result.lock);
          setError(null);
        }
      } catch (caughtError) {
        if (!cancelled) {
          onChange(null);
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Referentrollen kunne ikke fornyes.",
          );
        }
      }
    }

    const interval = window.setInterval(() => void heartbeat(), 30000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void heartbeat();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [canEdit, isCurrentReferent, onChange, sendReferentAction]);

  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-surface px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="page-eyebrow">Referent</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {activeLock
              ? activeLock.isCurrentUser
                ? "Du er referent"
                : `${activeLock.memberName} er referent`
              : "Ingen aktiv referent"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {activeLock
              ? activeLock.isCurrentUser
                ? "Du kan redigere de officielle referatfelter. Andre kan stadig skrive interne noter og oprette opgaver."
                : `Referatfelter er låst, fordi ${activeLock.memberName} er referent. Du kan stadig skrive interne noter og oprette opgaver.`
              : "Tag rollen som referent for at skrive i de officielle referatfelter."}
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            {isCurrentReferent ? (
              <Button
                disabled={pendingAction !== null}
                onClick={() => void handleAction("release")}
                type="button"
                variant="secondary"
              >
                {pendingAction === "release"
                  ? "Afgiver..."
                  : "Afgiv referentrolle"}
              </Button>
            ) : (
              <Button
                disabled={pendingAction !== null || Boolean(activeLock)}
                onClick={() => void handleAction("claim")}
                type="button"
              >
                {pendingAction === "claim"
                  ? "Tager rolle..."
                  : "Tag rolle som referent"}
              </Button>
            )}
          </div>
        ) : null}
      </div>
      {message ? (
        <p className="mt-2 text-xs font-medium text-success">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs font-medium text-danger">{error}</p>
      ) : null}
    </section>
  );
}

function MinutesSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h5 className="text-sm font-semibold text-ink">{children}</h5>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function normalizeContinuationText(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/é/g, "e")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mentionsContinuationToNextMeeting(...values: string[]) {
  const text = normalizeContinuationText(firstRichTextToPlainText(...values));
  return /\bforts?aette(?:r)? til naeste moede\b/.test(text);
}

function AgendaPrivateNoteEditor({
  organizationId,
  userId,
  committeeId,
  meetingId,
  agendaItemId,
  initialPrivateNote,
}: {
  organizationId: string;
  userId: string;
  committeeId: string;
  meetingId: string;
  agendaItemId: string;
  initialPrivateNote: AgendaItemPrivateNote | null;
}) {
  const [privateNote, setPrivateNote] = useState(initialPrivateNote);
  const [content, setContent] = useState(initialPrivateNote?.content ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const privateNoteDraft: AgendaPrivateNoteDraft = { content };

  async function persistPrivateNote(
    draft: AgendaPrivateNoteDraft,
    expectedUpdatedAt: string | null,
  ) {
    return readResponse<{
      note: AgendaItemPrivateNote;
      message: string;
    }>(
      await fetch(
        `/api/meetings/${meetingId}/agenda-items/${agendaItemId}/private-note`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            committeeId,
            expectedUpdatedAt,
            content: draft.content,
          }),
        },
      ),
    );
  }

  const autosave = useOfflineAutosave({
    storageKey: `agenda-private-note:v1:${userId}:${organizationId}:${committeeId}:${meetingId}:agenda:${agendaItemId}`,
    data: privateNoteDraft,
    serverUpdatedAt: privateNote?.updated_at ?? null,
    enabled: true,
    save: persistPrivateNote,
    restore: (draft) => setContent(draft.content),
    onSaved: (result) => {
      setPrivateNote(result.note);
      setMessage(result.message);
      setError(null);
    },
    onError: (caughtError) => {
      setMessage(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Din interne note kunne ikke gemmes.",
      );
    },
    getSavedServerUpdatedAt: (result) => result.note.updated_at,
    debounceMs: 1200,
  });

  return (
    <div
      className="space-y-3 rounded-[var(--radius-control)] border border-line bg-subtle/40 p-3"
      onBlurCapture={() => void autosave.flush()}
    >
      <div>
        <p className="text-sm font-semibold">Intern note</p>
        <p className="mt-1 text-xs text-muted">
          Kun du kan se denne note. Den bliver ikke en del af referatet, PDF
          eller mails.
        </p>
      </div>
      <LocalDraftConflict
        draft={autosave.conflict}
        onKeepServer={autosave.keepServerVersion}
        onRestore={autosave.restoreLocalDraft}
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      <RichTextEditor
        id={`private-note-${agendaItemId}`}
        minHeightClass="min-h-24"
        onChange={setContent}
        value={content}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AutosaveStatusLine
          errorMessage={autosave.errorMessage}
          onRetry={() => void autosave.retry()}
          status={autosave.status}
        />
        <Button
          disabled={autosave.status === "saving"}
          onClick={() => void autosave.saveNow()}
          size="sm"
          type="button"
          variant="secondary"
        >
          {autosave.status === "saving" ? "Gemmer..." : "Gem intern note"}
        </Button>
      </div>
    </div>
  );
}

function AgendaReorderModal({
  organizationId,
  committeeId,
  meetingId,
  occurrences,
}: {
  organizationId: string;
  committeeId: string;
  meetingId: string;
  occurrences: AgendaOccurrence[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [orderedIds, setOrderedIds] = useState<string[]>(
    occurrences.map((occurrence) => occurrence.id),
  );
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const occurrencesById = new Map(
    occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const orderedOccurrences = orderedIds.flatMap((occurrenceId) => {
    const occurrence = occurrencesById.get(occurrenceId);
    return occurrence ? [occurrence] : [];
  });
  const hasChanges = orderedIds.some(
    (occurrenceId, index) => occurrenceId !== occurrences[index]?.id,
  );

  function openModal() {
    setOrderedIds(occurrences.map((occurrence) => occurrence.id));
    setDraggedId(null);
    setError(null);
    setOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setOpen(false);
    setDraggedId(null);
    setError(null);
  }

  function moveDraggedOccurrence(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setOrderedIds((currentIds) => {
      const nextIds = currentIds.filter(
        (occurrenceId) => occurrenceId !== draggedId,
      );
      const targetIndex = nextIds.indexOf(targetId);
      if (targetIndex === -1) return currentIds;
      nextIds.splice(targetIndex, 0, draggedId);
      return nextIds;
    });
  }

  async function saveOrder() {
    setSaving(true);
    setError(null);
    try {
      await readResponse<{ message: string }>(
        await fetch(
          `/api/meetings/${meetingId}/agenda-items/reorder?organizationId=${organizationId}&committeeId=${committeeId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ occurrenceIds: orderedIds }),
          },
        ),
      );
      setOpen(false);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Rækkefølgen kunne ikke gemmes.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (occurrences.length < 2) return null;

  return (
    <>
      <Button onClick={openModal} size="sm" type="button" variant="secondary">
        Ændr rækkefølge
      </Button>
      <Modal
        description="Træk punkterne til den ønskede rækkefølge. Ændringer gemmes først, når du vælger Gem rækkefølge."
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            {error ? (
              <p className="text-sm font-medium text-danger" role="alert">
                {error}
              </p>
            ) : (
              <p className="text-xs text-muted">
                PDF og punktnumre følger den gemte rækkefølge.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                disabled={saving}
                onClick={closeModal}
                size="sm"
                type="button"
                variant="secondary"
              >
                Annuller
              </Button>
              <Button
                disabled={saving || !hasChanges}
                onClick={() => void saveOrder()}
                size="sm"
                type="button"
              >
                {saving ? "Gemmer..." : "Gem rækkefølge"}
              </Button>
            </div>
          </div>
        }
        maxWidth="lg"
        onClose={closeModal}
        open={open}
        title="Ændr rækkefølge"
      >
        <div className="divide-y divide-line border-y border-line">
          {orderedOccurrences.map((occurrence, index) => {
            const item = occurrence.agenda_items;
            return (
              <div
                className={clsx(
                  "grid cursor-grab grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 bg-surface px-2 py-2 text-sm transition active:cursor-grabbing",
                  draggedId === occurrence.id && "bg-brand-soft/60",
                )}
                draggable
                key={occurrence.id}
                onDragEnd={() => setDraggedId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDragStart={(event) => {
                  setDraggedId(occurrence.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", occurrence.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  moveDraggedOccurrence(occurrence.id);
                }}
              >
                <span
                  aria-hidden="true"
                  className="flex items-center gap-1 text-xs font-semibold text-muted"
                >
                  <span className="text-base leading-none">::</span>
                  {index + 1}.
                </span>
                <span className="min-w-0 truncate font-medium text-ink">
                  {item?.title ?? "Dagsordenspunkt uden titel"}
                </span>
              </div>
            );
          })}
        </div>
      </Modal>
    </>
  );
}

function AgendaMinutesCard({
  organizationId,
  userId,
  committeeId,
  meetingId,
  root,
  occurrence,
  displayNumber,
  initialMinutes,
  initialPrivateNote,
  responsiblePeople,
  previousMeetingMinutes,
  attachments,
  canEdit,
  canEditDecisions,
  canEditTasks,
  meetingDate,
  meetingDecisions,
  meetingTasks,
  decisionCategorySource,
  taskCategorySource,
  decisionHistory,
  minutesStatus,
}: {
  organizationId: string;
  userId: string;
  committeeId: string;
  meetingId: string;
  root: string;
  occurrence: AgendaOccurrence;
  displayNumber: number;
  initialMinutes: AgendaItemMinutes | null;
  initialPrivateNote: AgendaItemPrivateNote | null;
  responsiblePeople: MinutesResponsiblePerson[];
  previousMeetingMinutes: PreviousMeetingMinutesReference;
  attachments: MinuteAttachmentView[];
  canEdit: boolean;
  canEditDecisions: boolean;
  canEditTasks: boolean;
  meetingDate: string;
  meetingDecisions: DecisionView[];
  meetingTasks: TaskView[];
  decisionCategorySource: DecisionView[];
  taskCategorySource: TaskView[];
  minutesStatus: MinutesStatus;
  decisionHistory: {
    categories: string[];
    decisions: DecisionView[];
  };
}) {
  const router = useRouter();
  const item = occurrence.agenda_items!;
  const itemType = item.item_type;
  const [minutes, setMinutes] = useState(initialMinutes);
  const [notes, setNotes] = useState(initialMinutes?.notes ?? "");
  const [decision, setDecision] = useState(initialMinutes?.decision ?? "");
  const [followUp, setFollowUp] = useState(initialMinutes?.follow_up ?? "");
  const [responsibleUserId, setResponsibleUserId] = useState(
    initialMinutes?.responsible_user_id ?? "",
  );
  const [deadline, setDeadline] = useState(initialMinutes?.deadline ?? "");
  const [status, setStatus] = useState<AgendaMinutesStatus>(
    normalizeAgendaItemMinutesStatus(itemType, initialMinutes?.status),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isOpen, setIsOpen] = useState(false);
  const [activeActionPanel, setActiveActionPanel] =
    useState<AgendaActionPanel>(null);
  const [deleting, setDeleting] = useState(false);
  const transferStatusRef = useRef<AgendaMinutesStatus | null>(
    initialMinutes &&
      shouldSuggestAgendaItemTransfer(itemType, initialMinutes.status)
      ? initialMinutes.status
      : null,
  );

  const draftData: AgendaMinutesDraft = {
    notes,
    decision,
    followUp,
    responsibleUserId,
    deadline,
    status,
  };

  function validateDraft(draft: AgendaMinutesDraft) {
    setMessage(null);
    setError(null);
    setFieldErrors({});
    const requiresAction = agendaItemMinutesNeedsAction(
      itemType,
      draft.status,
      draft.followUp,
    );
    if (requiresAction && (!draft.responsibleUserId || !draft.deadline)) {
      const nextErrors: FieldErrors = {};
      if (!draft.responsibleUserId) {
        nextErrors.responsibleUserId = [
          "Ansvarlig mangler for opfølgningspunktet.",
        ];
      }
      if (!draft.deadline) {
        nextErrors.deadline = ["Deadline mangler for opfølgningspunktet."];
      }
      throw Object.assign(
        new Error("Udfyld de manglende oplysninger, og prøv igen."),
        { fieldErrors: nextErrors },
      );
    }
  }

  async function persistDraft(
    draft: AgendaMinutesDraft,
    expectedUpdatedAt: string | null,
  ) {
    validateDraft(draft);
    return readResponse<{
      minutes: AgendaItemMinutes;
      message: string;
    }>(
      await fetch(
        `/api/meetings/${meetingId}/agenda-items/${item.id}/minutes`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            committeeId,
            agendaItemOccurrenceId: occurrence.id,
            expectedUpdatedAt,
            itemType,
            notes: draft.notes,
            decision: draft.decision,
            followUp: draft.followUp,
            responsibleUserId: draft.responsibleUserId || null,
            deadline: draft.deadline || null,
            status: draft.status,
          }),
        },
      ),
    );
  }

  const agendaStorageKey = `committee-minutes:v1:${userId}:${organizationId}:${committeeId}:${meetingId}:agenda:${item.id}`;
  const autosave = useOfflineAutosave({
    storageKey: agendaStorageKey,
    data: draftData,
    serverUpdatedAt: initialMinutes?.updated_at ?? null,
    enabled: canEdit,
    save: persistDraft,
    restore: (draft) => {
      setNotes(draft.notes);
      setDecision(draft.decision);
      setFollowUp(draft.followUp);
      setResponsibleUserId(draft.responsibleUserId);
      setDeadline(draft.deadline);
      setStatus(draft.status);
    },
    onSaved: (result) => {
      setMinutes(result.minutes);
      setStatus(result.minutes.status);
      setMessage(null);
      setError(null);
      setFieldErrors({});
      const nextTransferStatus = shouldSuggestAgendaItemTransfer(
        itemType,
        result.minutes.status,
      )
        ? result.minutes.status
        : null;
      if (nextTransferStatus !== transferStatusRef.current) {
        transferStatusRef.current = nextTransferStatus;
        router.refresh();
      }
    },
    onError: (caughtError) => {
      const typedError = caughtError as Error & { fieldErrors?: FieldErrors };
      setError(typedError.message);
      setFieldErrors(typedError.fieldErrors || {});
    },
    getSavedServerUpdatedAt: (result) => result.minutes.updated_at,
  });

  useEffect(() => {
    setStatus((currentStatus) =>
      normalizeAgendaItemMinutesStatus(itemType, currentStatus),
    );
  }, [itemType]);

  useEffect(() => {
    if (
      !initialMinutes ||
      !isNewerServerVersion(initialMinutes.updated_at, minutes?.updated_at)
    ) {
      return;
    }

    setMinutes(initialMinutes);
    setStatus(
      normalizeAgendaItemMinutesStatus(itemType, initialMinutes.status),
    );
  }, [initialMinutes, itemType, minutes?.updated_at]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await autosave.saveNow();
    if (result) setMessage(result.message);
  }

  async function removeAgendaItem() {
    if (
      !window.confirm(
        "Er du sikker på, at du vil flytte dette til papirkurven? Elementet kan gendannes i 30 dage.",
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/agenda-items/${item.id}?organizationId=${organizationId}&committeeId=${committeeId}`,
        { method: "DELETE" },
      );
      await readResponse<{ removed: boolean; message: string }>(response);
      localStorage.removeItem(agendaStorageKey);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Dagsordenspunktet kunne ikke fjernes.",
      );
      setDeleting(false);
    }
  }

  function toggleActionPanel(panel: Exclude<AgendaActionPanel, null>) {
    setActiveActionPanel((currentPanel) =>
      currentPanel === panel ? null : panel,
    );
  }

  const responsible = responsiblePeople.find(
    (person) => person.id === minutes?.responsible_user_id,
  );
  const isStandardItem = item.standard_key !== null;
  const isTransferredItem = item.parent_id !== null;
  const isAnyOtherBusiness = item.standard_key === "any_other_business";
  const requiresAction = agendaItemMinutesNeedsAction(
    itemType,
    status,
    followUp,
  );
  const relatedDecisions = meetingDecisions.filter(
    (relatedDecision) => relatedDecision.agenda_item_id === item.id,
  );
  const relatedTasks = meetingTasks.filter(
    (relatedTask) => relatedTask.agenda_item_id === item.id,
  );
  const followUpText = firstRichTextToPlainText(followUp).trim();
  const hasFollowUpCaptured = Boolean(followUpText || relatedTasks.length > 0);
  const continuationIndicated =
    mentionsContinuationToNextMeeting(notes, decision) ||
    shouldSuggestAgendaItemTransfer(itemType, status);
  const shouldHighlightFollowUp = continuationIndicated && !hasFollowUpCaptured;
  const shouldConfirmFollowUp = continuationIndicated && hasFollowUpCaptured;
  const hasMinutesContent = Boolean(
    firstRichTextToPlainText(notes, decision, followUp).trim(),
  );
  const statusOptions = agendaItemMinutesStatusOptions[itemType];
  const fieldGuidance = agendaMinutesFieldGuidance[itemType];

  return (
    <details
      className={clsx(
        "group overflow-hidden rounded-[var(--radius-panel)] border bg-subtle/60 shadow-sm",
        isStandardItem ? "border-line bg-subtle/70" : "border-line-strong",
        isTransferredItem && "border-l-4 border-l-progress/40",
        isAnyOtherBusiness && "border-dashed",
      )}
      id={`agenda-point-${occurrence.id}`}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary
        className={clsx(
          "grid cursor-pointer list-none grid-cols-[2rem_minmax(0,1fr)] items-start gap-2.5 px-3 py-2.5 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto] [&::-webkit-details-marker]:hidden",
          isStandardItem ? "bg-subtle/75" : "bg-subtle/45",
        )}
      >
        <span className="font-document flex h-7 w-7 shrink-0 items-center justify-center border-r border-line text-base font-semibold text-brand">
          {displayNumber}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {item.standard_key ? (
              <StatusBadge>
                {standardAgendaItemLabels[item.standard_key]}
              </StatusBadge>
            ) : null}
            {isTransferredItem ? (
              <StatusBadge tone="progress">Overført punkt</StatusBadge>
            ) : null}
            {!hasMinutesContent ? (
              <StatusBadge tone="warning">Mangler referat</StatusBadge>
            ) : null}
            {requiresAction ? (
              <StatusBadge tone="warning">Kræver opfølgning</StatusBadge>
            ) : null}
            {relatedDecisions.length > 0 ? (
              <StatusBadge tone="success">
                {relatedDecisions.length}{" "}
                {relatedDecisions.length === 1 ? "beslutning" : "beslutninger"}
              </StatusBadge>
            ) : null}
            {relatedTasks.length > 0 ? (
              <StatusBadge tone="info">
                {relatedTasks.length}{" "}
                {relatedTasks.length === 1 ? "opgave" : "opgaver"}
              </StatusBadge>
            ) : null}
          </div>
          <h4
            className={clsx(
              "mt-1.5 break-words text-base font-semibold leading-6",
              isAnyOtherBusiness && "italic",
            )}
          >
            <AgendaItemDocumentTitle title={item.title} type={item.item_type} />
          </h4>
          {item.objective || item.description ? (
            <p className="mt-1 line-clamp-1 text-xs text-muted">
              {item.objective || item.description}
            </p>
          ) : null}
        </div>
        <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1 sm:flex-col sm:items-end">
          <StatusBadge tone={agendaStatusTones[status]}>
            {agendaItemMinutesStatusLabels[status]}
          </StatusBadge>
          <span
            aria-hidden="true"
            className="text-lg text-muted transition group-open:rotate-180"
          >
            ⌄
          </span>
        </div>
      </summary>

      {item.standard_key === "previous_minutes_approval" ? (
        <PreviousMinutesReference
          reference={previousMeetingMinutes}
          root={root}
        />
      ) : null}

      {canEdit ? (
        <form
          className="space-y-3.5 border-t border-line p-3"
          onBlurCapture={() => void autosave.flush()}
          onSubmit={save}
        >
          <LocalDraftConflict
            draft={autosave.conflict}
            onKeepServer={autosave.keepServerVersion}
            onRestore={autosave.restoreLocalDraft}
          />
          {error ? (
            <div
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              <p className="font-semibold">Referatet kunne ikke gemmes</p>
              <p className="mt-1">{error}</p>
            </div>
          ) : null}
          {message ? (
            <div
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              role="status"
            >
              {message}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <MinutesSectionLabel>Noter først</MinutesSectionLabel>
            <div className="flex min-w-56 flex-wrap items-center gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-wide text-muted"
                htmlFor={`status-${occurrence.id}`}
              >
                Punktstatus
              </label>
              <Select
                aria-describedby={
                  fieldErrors.status?.[0]
                    ? `status-${occurrence.id}-error`
                    : undefined
                }
                aria-invalid={Boolean(fieldErrors.status?.[0])}
                className="min-h-8 py-1 text-xs"
                id={`status-${occurrence.id}`}
                onChange={(event) =>
                  setStatus(event.target.value as AgendaMinutesStatus)
                }
                value={status}
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {agendaItemMinutesStatusLabels[option]}
                  </option>
                ))}
              </Select>
              {fieldErrors.status?.[0] ? (
                <p
                  className="basis-full text-xs text-red-700"
                  id={`status-${occurrence.id}-error`}
                >
                  {fieldErrors.status[0]}
                </p>
              ) : null}
            </div>
          </div>
          <div className="space-y-2 rounded-[var(--radius-panel)] bg-surface p-3 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <label className="label" htmlFor={`notes-${occurrence.id}`}>
                  Noter/referat
                </label>
                <p className="mt-0.5 text-xs text-muted">
                  Skriv det væsentlige fra punktet her. Beslutninger og opgaver
                  oprettes som handlinger bagefter.
                </p>
              </div>
            </div>
            <RichTextEditor
              id={`notes-${occurrence.id}`}
              minHeightClass="min-h-24"
              onChange={setNotes}
              value={notes}
            />
            <details className="group mt-1.5 text-xs text-muted">
              <summary className="inline-flex cursor-pointer list-none font-medium text-secondary hover:underline [&::-webkit-details-marker]:hidden">
                Skrivehjælp
              </summary>
              <div className="mt-1.5 space-y-1">
                <p className="mt-1.5 text-xs leading-4 text-slate-500">
                  Skriv det væsentlige fra behandlingen af punktet. Brug feltet
                  til orienteringer, drøftelser, baggrund og vigtige pointer.
                </p>
                <p className="mt-1 text-xs font-medium leading-4 text-slate-600">
                  {fieldGuidance.notes}
                </p>
              </div>
            </details>
            {fieldErrors.notes?.[0] ? (
              <p className="mt-1 text-sm text-red-700">
                {fieldErrors.notes[0]}
              </p>
            ) : null}
          </div>
          <div className="space-y-3 rounded-[var(--radius-panel)] bg-surface/75 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {canEditDecisions ? (
                <DecisionCreateModal
                  agendaItems={[{ id: item.id, title: item.title }]}
                  categorySource={decisionCategorySource}
                  committeeId={committeeId}
                  initialAgendaItemId={item.id}
                  initialCategory={decisionHistory.categories[0] ?? ""}
                  initialDeadline={deadline}
                  initialDescription={firstRichTextToPlainText(notes)}
                  initialResponsibleUserId={responsibleUserId}
                  initialTitle={item.title}
                  meetingDate={meetingDate}
                  meetingId={meetingId}
                  organizationId={organizationId}
                  responsiblePeople={responsiblePeople}
                  sourceLabel="punktnoterne"
                  triggerLabel="+ Beslutning"
                />
              ) : null}
              {canEditTasks ? (
                <TaskCreateModal
                  agendaItems={[{ id: item.id, title: item.title }]}
                  categorySource={taskCategorySource}
                  committeeId={committeeId}
                  initialAgendaItemId={item.id}
                  initialCategory={decisionHistory.categories[0] ?? ""}
                  initialDeadline={deadline}
                  initialDescription={firstRichTextToPlainText(notes)}
                  initialMeetingId={meetingId}
                  initialResponsibleUserId={responsibleUserId}
                  initialTitle={item.title}
                  instanceId={`agenda-task-${item.id}`}
                  meetings={[
                    {
                      id: meetingId,
                      title: "Aktuelt møde",
                      starts_at: meetingDate,
                    },
                  ]}
                  organizationId={organizationId}
                  responsiblePeople={responsiblePeople}
                  sourceLabel="punktnoterne"
                  triggerLabel="+ Opgave"
                />
              ) : null}
              <MinutesAiAssistant
                agendaItemId={item.id}
                committeeId={committeeId}
                field="notes"
                meetingId={meetingId}
                onApply={setNotes}
                organizationId={organizationId}
                prominent
                source="agenda_item_minutes"
                value={notes}
              />
              <button
                aria-expanded={activeActionPanel === "privateNote"}
                className={clsx(
                  "min-h-9 rounded-[var(--radius-control)] border px-3 py-2 text-sm font-semibold transition",
                  activeActionPanel === "privateNote"
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line bg-surface text-muted hover:bg-subtle hover:text-ink",
                )}
                onClick={() => toggleActionPanel("privateNote")}
                type="button"
              >
                Interne noter
              </button>
              <button
                aria-expanded={activeActionPanel === "followUp"}
                aria-label={
                  shouldHighlightFollowUp
                    ? "Punktet ser ud til at fortsætte. Opret opfølgning."
                    : undefined
                }
                className={clsx(
                  "min-h-9 rounded-[var(--radius-control)] border px-3 py-2 text-sm font-semibold transition",
                  activeActionPanel === "followUp"
                    ? "border-brand bg-brand-soft text-brand"
                    : shouldHighlightFollowUp
                      ? "border-brand bg-brand text-white shadow-sm ring-2 ring-brand/20 hover:bg-brand-hover"
                      : shouldConfirmFollowUp
                        ? "border-success/30 bg-success/10 text-success hover:bg-success/15"
                        : "border-line bg-surface text-ink hover:bg-subtle",
                )}
                onClick={() => toggleActionPanel("followUp")}
                type="button"
              >
                + Opfølgning
                {shouldHighlightFollowUp ? (
                  <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide">
                    anbefalet
                  </span>
                ) : null}
              </button>
              <button
                aria-expanded={activeActionPanel === "more"}
                className={clsx(
                  "min-h-9 rounded-[var(--radius-control)] border px-3 py-2 text-sm font-semibold transition",
                  activeActionPanel === "more"
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line bg-surface text-muted hover:bg-subtle hover:text-ink",
                )}
                onClick={() => toggleActionPanel("more")}
                type="button"
              >
                Mere
              </button>
            </div>
            {shouldHighlightFollowUp ? (
              <p className="rounded-[var(--radius-control)] border border-brand/25 bg-brand-soft px-3 py-2 text-sm font-medium text-brand">
                Punktet ser ud til at fortsætte. Opret en opfølgning?
              </p>
            ) : shouldConfirmFollowUp ? (
              <p className="rounded-[var(--radius-control)] border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">
                Opfølgning er registreret for dette punkt.
              </p>
            ) : null}
            {activeActionPanel === "privateNote" ? (
              <div className="border-t border-line pt-3">
                <AgendaPrivateNoteEditor
                  agendaItemId={item.id}
                  committeeId={committeeId}
                  initialPrivateNote={initialPrivateNote}
                  meetingId={meetingId}
                  organizationId={organizationId}
                  userId={userId}
                />
              </div>
            ) : null}
            {activeActionPanel === "followUp" ? (
              <div className="space-y-3 border-t border-line pt-3">
                <div className="grid gap-2 text-xs text-muted sm:grid-cols-3">
                  <div>
                    <p className="font-semibold text-ink">Opret opgave</p>
                    <p className="mt-1">
                      Brug + Opgave, når opfølgningen skal eksekveres.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-ink">Overfør punkt</p>
                    <p className="mt-1">
                      Vælg en status ovenfor, der markerer videre behandling.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-ink">
                      Kræver beslutning senere
                    </p>
                    <p className="mt-1">
                      Notér behovet og sæt ansvar/deadline ved behov.
                    </p>
                  </div>
                </div>
                <div>
                  <label
                    className="label"
                    htmlFor={`follow-up-${occurrence.id}`}
                  >
                    Opfølgningsnote
                  </label>
                  <RichTextEditor
                    describedBy={
                      fieldErrors.followUp?.[0]
                        ? `follow-up-${occurrence.id}-error`
                        : undefined
                    }
                    id={`follow-up-${occurrence.id}`}
                    invalid={Boolean(fieldErrors.followUp?.[0])}
                    minHeightClass="min-h-10"
                    onChange={setFollowUp}
                    value={followUp}
                  />
                  <MinutesAiAssistant
                    agendaItemId={item.id}
                    committeeId={committeeId}
                    field="follow_up"
                    meetingId={meetingId}
                    onApply={setFollowUp}
                    organizationId={organizationId}
                    source="agenda_item_minutes"
                    value={followUp}
                  />
                  {fieldErrors.followUp?.[0] ? (
                    <p
                      className="mt-1 text-sm text-red-700"
                      id={`follow-up-${occurrence.id}-error`}
                    >
                      {fieldErrors.followUp[0]}
                    </p>
                  ) : null}
                </div>
                {!isStandardItem ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className={requiresAction ? "" : "opacity-75"}>
                      <label
                        className="label"
                        htmlFor={`responsible-${occurrence.id}`}
                      >
                        Ansvarlig {requiresAction ? "(påkrævet)" : "(valgfri)"}
                      </label>
                      <Select
                        aria-describedby={
                          fieldErrors.responsibleUserId?.[0]
                            ? `responsible-${occurrence.id}-error`
                            : undefined
                        }
                        aria-invalid={Boolean(
                          fieldErrors.responsibleUserId?.[0],
                        )}
                        id={`responsible-${occurrence.id}`}
                        onChange={(event) =>
                          setResponsibleUserId(event.target.value)
                        }
                        value={responsibleUserId}
                      >
                        <option value="">Ingen ansvarlig</option>
                        {responsiblePeople.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </Select>
                      {fieldErrors.responsibleUserId?.[0] ? (
                        <p
                          className="mt-1 text-sm text-red-700"
                          id={`responsible-${occurrence.id}-error`}
                        >
                          {fieldErrors.responsibleUserId[0]}
                        </p>
                      ) : null}
                    </div>
                    <div className={requiresAction ? "" : "opacity-75"}>
                      <label
                        className="label"
                        htmlFor={`deadline-${occurrence.id}`}
                      >
                        Deadline {requiresAction ? "(påkrævet)" : "(valgfri)"}
                      </label>
                      <Input
                        aria-describedby={
                          fieldErrors.deadline?.[0]
                            ? `deadline-${occurrence.id}-error`
                            : undefined
                        }
                        aria-invalid={Boolean(fieldErrors.deadline?.[0])}
                        id={`deadline-${occurrence.id}`}
                        onChange={(event) => setDeadline(event.target.value)}
                        type="date"
                        value={deadline}
                      />
                      {fieldErrors.deadline?.[0] ? (
                        <p
                          className="mt-1 text-sm text-red-700"
                          id={`deadline-${occurrence.id}-error`}
                        >
                          {fieldErrors.deadline[0]}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {activeActionPanel === "more" ? (
              <div className="space-y-3 border-t border-line pt-3">
                <div>
                  <label
                    className="label"
                    htmlFor={`decision-${occurrence.id}`}
                  >
                    Gammelt beslutningsfelt
                  </label>
                  <RichTextEditor
                    describedBy={
                      fieldErrors.decision?.[0]
                        ? `decision-${occurrence.id}-error`
                        : undefined
                    }
                    id={`decision-${occurrence.id}`}
                    invalid={Boolean(fieldErrors.decision?.[0])}
                    minHeightClass="min-h-10"
                    onChange={setDecision}
                    value={decision}
                  />
                  <p className="mt-1 text-xs text-muted">
                    Brug primært + Beslutning. Feltet bevares for ældre
                    referater og intern struktur.
                  </p>
                  <MinutesAiAssistant
                    agendaItemId={item.id}
                    committeeId={committeeId}
                    field="decision"
                    meetingId={meetingId}
                    onApply={setDecision}
                    organizationId={organizationId}
                    source="agenda_item_minutes"
                    value={decision}
                  />
                  {fieldErrors.decision?.[0] ? (
                    <p
                      className="mt-1 text-sm text-red-700"
                      id={`decision-${occurrence.id}-error`}
                    >
                      {fieldErrors.decision[0]}
                    </p>
                  ) : null}
                </div>
                {canEditTasks ? (
                  <div className="border-t border-line pt-3">
                    <p className="mb-2 text-xs text-muted">
                      Analysér kun dette punkt med AI.
                    </p>
                    <AiTaskReviewModal
                      agendaItemId={item.id}
                      categorySource={taskCategorySource}
                      committeeId={committeeId}
                      decisions={meetingDecisions}
                      existingTasks={relatedTasks}
                      meetingId={meetingId}
                      minutesStatus={minutesStatus}
                      organizationId={organizationId}
                      responsiblePeople={responsiblePeople}
                      source="agenda_item_minutes"
                      sourceLabel={`punktreferatet “${item.title}”`}
                    />
                  </div>
                ) : null}
                {canEdit ? (
                  <div className="space-y-2 border-t border-line pt-3">
                    <p className="text-xs text-muted">
                      Fjern kun dette mødes forekomst, eller flyt hele
                      dagsordenspunktet til papirkurven.
                    </p>
                    <TrashActionButton
                      confirmMessage="Vil du fjerne punktet fra dette møde? Selve dagsordenspunktet og dets historik bevares."
                      endpoint={`/api/agenda-item-occurrences/${occurrence.id}?organizationId=${organizationId}&committeeId=${committeeId}`}
                      label="Fjern punkt fra dette møde"
                      pendingLabel="Fjerner..."
                      variant="secondary"
                    />
                    <button
                      className="rounded-[var(--radius-control)] border border-danger/25 bg-surface px-3 py-2 text-sm font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-60"
                      disabled={deleting || autosave.status === "saving"}
                      onClick={removeAgendaItem}
                      type="button"
                    >
                      {deleting
                        ? "Flytter..."
                        : "Flyt dagsordenspunkt til papirkurv"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <div className="space-y-1">
              <Link
                className="text-sm font-semibold text-forest hover:underline"
                href={`${root}/agenda-items/${item.id}`}
              >
                Åbn dagsordenspunkt
              </Link>
              <AutosaveStatusLine
                errorMessage={autosave.errorMessage}
                onRetry={() => void autosave.retry()}
                status={autosave.status}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={deleting || autosave.status === "saving"}
                type="submit"
              >
                {autosave.status === "saving"
                  ? "Gemmer..."
                  : "Gem punktreferat"}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <div className="minutes-document grid gap-4 border-t border-line p-4 sm:p-5 md:grid-cols-2">
          <div className="minutes-document-section md:col-span-2">
            <p className="minutes-document-label">Noter</p>
            <RichTextContent
              className="mt-2 text-sm leading-7"
              value={minutes?.notes}
            />
          </div>
          {!isStandardItem ? (
            <>
              <div>
                <p className="text-sm font-semibold">Ansvarlig</p>
                <p className="mt-1 text-sm">
                  {responsible?.name || <EmptyValue />}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold">Deadline</p>
                <p className="mt-1 text-sm">
                  {minutes?.deadline ? (
                    formatDate(minutes.deadline)
                  ) : (
                    <EmptyValue />
                  )}
                </p>
              </div>
            </>
          ) : null}
          {minutes?.decision || minutes?.follow_up ? (
            <details className="group rounded-[var(--radius-control)] border border-line bg-subtle/30 md:col-span-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>Beslutning og opfølgning</span>
                <span className="text-xs font-semibold text-brand">
                  <span className="group-open:hidden">Åbn</span>
                  <span className="hidden group-open:inline">Skjul</span>
                </span>
              </summary>
              <div className="grid gap-3 border-t border-line p-3 md:grid-cols-2">
                {minutes?.decision ? (
                  <div className="minutes-decision">
                    <p className="minutes-document-label text-success">
                      Beslutning
                    </p>
                    <RichTextContent
                      className="mt-2 text-sm leading-7"
                      value={minutes.decision}
                    />
                  </div>
                ) : null}
                {minutes?.follow_up ? (
                  <div className="minutes-follow-up">
                    <p className="minutes-document-label text-warning">
                      Opfølgning
                    </p>
                    <RichTextContent
                      className="mt-2 text-sm leading-7"
                      value={minutes.follow_up}
                    />
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
          <details className="group rounded-[var(--radius-control)] border border-line bg-subtle/30 md:col-span-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <span>Interne noter</span>
              <span className="text-xs font-semibold text-brand">
                <span className="group-open:hidden">Åbn</span>
                <span className="hidden group-open:inline">Skjul</span>
              </span>
            </summary>
            <div className="border-t border-line p-3">
              <AgendaPrivateNoteEditor
                agendaItemId={item.id}
                committeeId={committeeId}
                initialPrivateNote={initialPrivateNote}
                meetingId={meetingId}
                organizationId={organizationId}
                userId={userId}
              />
            </div>
          </details>
          <div className="md:col-span-2">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className="text-sm font-semibold text-forest hover:underline"
                href={`${root}/agenda-items/${item.id}`}
              >
                Åbn dagsordenspunkt
              </Link>
              {canEditDecisions ? (
                <DecisionCreateModal
                  agendaItems={[{ id: item.id, title: item.title }]}
                  categorySource={decisionCategorySource}
                  committeeId={committeeId}
                  initialAgendaItemId={item.id}
                  initialCategory={decisionHistory.categories[0] ?? ""}
                  initialDeadline={minutes?.deadline ?? ""}
                  initialDescription={firstRichTextToPlainText(
                    minutes?.decision,
                    minutes?.notes,
                    minutes?.follow_up,
                  )}
                  initialResponsibleUserId={minutes?.responsible_user_id ?? ""}
                  initialTitle={item.title}
                  meetingDate={meetingDate}
                  meetingId={meetingId}
                  organizationId={organizationId}
                  responsiblePeople={responsiblePeople}
                  sourceLabel="punktreferatet"
                  triggerLabel="Opret beslutning fra referat"
                />
              ) : null}
              {canEditTasks ? (
                <>
                  <TaskCreateModal
                    agendaItems={[{ id: item.id, title: item.title }]}
                    categorySource={taskCategorySource}
                    committeeId={committeeId}
                    initialAgendaItemId={item.id}
                    initialCategory={decisionHistory.categories[0] ?? ""}
                    initialDeadline={minutes?.deadline ?? ""}
                    initialDescription={firstRichTextToPlainText(
                      minutes?.follow_up,
                      minutes?.notes,
                      minutes?.decision,
                    )}
                    initialMeetingId={meetingId}
                    initialResponsibleUserId={
                      minutes?.responsible_user_id ?? ""
                    }
                    initialTitle={item.title}
                    instanceId={`agenda-task-read-${item.id}`}
                    meetings={[
                      {
                        id: meetingId,
                        title: "Aktuelt møde",
                        starts_at: meetingDate,
                      },
                    ]}
                    organizationId={organizationId}
                    responsiblePeople={responsiblePeople}
                    sourceLabel="punktreferatet"
                    triggerLabel="Opret opgave"
                  />
                  <details className="group relative">
                    <summary className="min-h-9 cursor-pointer list-none rounded-[var(--radius-control)] bg-transparent px-3 py-2 text-sm font-semibold text-muted transition hover:bg-subtle hover:text-ink [&::-webkit-details-marker]:hidden">
                      Flere handlinger
                    </summary>
                    <div className="absolute right-0 z-10 mt-2 min-w-72 rounded-[var(--radius-panel)] border border-line bg-surface p-3 shadow-lg">
                      <p className="mb-2 text-xs text-muted">
                        Analysér kun dette punkt med AI.
                      </p>
                      <AiTaskReviewModal
                        agendaItemId={item.id}
                        categorySource={taskCategorySource}
                        committeeId={committeeId}
                        decisions={meetingDecisions}
                        existingTasks={meetingTasks.filter(
                          (relatedTask) =>
                            relatedTask.agenda_item_id === item.id,
                        )}
                        meetingId={meetingId}
                        minutesStatus={minutesStatus}
                        organizationId={organizationId}
                        responsiblePeople={responsiblePeople}
                        source="agenda_item_minutes"
                        sourceLabel={`punktreferatet “${item.title}”`}
                      />
                    </div>
                  </details>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {relatedDecisions.length > 0 || relatedTasks.length > 0 ? (
        <details className="group border-t border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden sm:px-5">
            <span className="flex flex-wrap items-center gap-2">
              Relationer
              {relatedDecisions.length > 0 ? (
                <span className="rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                  {relatedDecisions.length}{" "}
                  {relatedDecisions.length === 1
                    ? "beslutning"
                    : "beslutninger"}
                </span>
              ) : null}
              {relatedTasks.length > 0 ? (
                <span className="rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                  {relatedTasks.length}{" "}
                  {relatedTasks.length === 1 ? "opgave" : "opgaver"}
                </span>
              ) : null}
            </span>
            <span className="text-xs font-semibold text-brand">
              <span className="group-open:hidden">Åbn</span>
              <span className="hidden group-open:inline">Skjul</span>
            </span>
          </summary>
          <div className="grid gap-4 border-t border-line px-4 py-3 sm:px-5 md:grid-cols-2">
            {relatedDecisions.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Relaterede beslutninger
                </p>
                <RelatedDecisions
                  compact
                  decisions={relatedDecisions}
                  organizationId={organizationId}
                />
              </div>
            ) : null}
            {relatedTasks.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Relaterede opgaver
                </p>
                <RelatedTasks
                  compact
                  organizationId={organizationId}
                  tasks={relatedTasks}
                />
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
      <details className="group border-t border-line bg-subtle/20">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden sm:px-5">
          <span>Tidligere beslutninger om dette emne</span>
          <span
            aria-hidden="true"
            className="text-muted transition group-open:rotate-180"
          >
            ⌄
          </span>
        </summary>
        <div className="border-t border-line px-4 py-3 sm:px-5">
          <DecisionHistory
            compact
            history={decisionHistory}
            organizationId={organizationId}
          />
        </div>
      </details>
      <details className="group border-t border-line bg-subtle/30">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden sm:px-5">
          <span>
            Ekstra
            {attachments.length > 0 ? (
              <span className="ml-2 font-normal text-muted">
                {attachments.length}{" "}
                {attachments.length === 1 ? "vedhæftning" : "vedhæftninger"}
              </span>
            ) : null}
          </span>
          <span
            aria-hidden="true"
            className="text-muted transition group-open:rotate-180"
          >
            ⌄
          </span>
        </summary>
        <div className="border-t border-line p-4 sm:p-5">
          <MinuteAttachments
            agendaItemId={item.id}
            attachments={attachments}
            canEdit={canEdit}
            committeeId={committeeId}
            meetingId={meetingId}
            organizationId={organizationId}
          />
          {canEdit ? (
            <div className="mt-4 border-t border-line pt-4">
              <EditAgendaItemModal
                committeeId={committeeId}
                compact
                item={item}
                organizationId={organizationId}
              />
            </div>
          ) : null}
        </div>
      </details>
    </details>
  );
}

export function MeetingMinutesSection({
  organizationId,
  userId,
  committeeId,
  meetingId,
  root,
  occurrences,
  initialMeetingMinutes,
  initialAgendaItemMinutes,
  privateAgendaItemNotes,
  referentLock: initialReferentLock,
  responsiblePeople,
  previousMeetingMinutes,
  approvals,
  meetingAttachments,
  agendaItemAttachments,
  canApprove,
  canEdit,
  canEditDecisions,
  canEditTasks,
  meetingDate,
  meetingDecisions,
  meetingTasks,
  decisionCategorySource,
  taskCategorySource,
  decisionHistoryByAgendaItem,
}: {
  organizationId: string;
  userId: string;
  committeeId: string;
  meetingId: string;
  root: string;
  occurrences: AgendaOccurrence[];
  initialMeetingMinutes: MeetingMinutes | null;
  initialAgendaItemMinutes: AgendaItemMinutes[];
  privateAgendaItemNotes: AgendaItemPrivateNote[];
  referentLock: MeetingMinutesReferentLockView | null;
  responsiblePeople: MinutesResponsiblePerson[];
  previousMeetingMinutes: PreviousMeetingMinutesReference;
  approvals: MeetingMinuteApprovalView[];
  meetingAttachments: MinuteAttachmentView[];
  agendaItemAttachments: MinuteAttachmentView[];
  canApprove: boolean;
  canEdit: boolean;
  canEditDecisions: boolean;
  canEditTasks: boolean;
  meetingDate: string;
  meetingDecisions: DecisionView[];
  meetingTasks: TaskView[];
  decisionCategorySource: DecisionView[];
  taskCategorySource: TaskView[];
  decisionHistoryByAgendaItem: Record<
    string,
    { categories: string[]; decisions: DecisionView[] }
  >;
}) {
  const [minutes, setMinutes] = useState(initialMeetingMinutes);
  const [minutesText, setMinutesText] = useState(
    initialMeetingMinutes?.minutes_text ?? "",
  );
  const [decisions, setDecisions] = useState(
    initialMeetingMinutes?.decisions ?? "",
  );
  const [internalNote, setInternalNote] = useState(
    initialMeetingMinutes?.internal_note ?? "",
  );
  const [meetingStatus, setMeetingStatus] = useState<MinutesStatus>(
    initialMeetingMinutes?.status ?? "draft",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [savingStatus, setSavingStatus] = useState<MinutesStatus | null>(null);
  const [isGeneralMinutesOpen, setIsGeneralMinutesOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.location.hash === "#general-minutes-content",
  );
  const [isEditingApproved, setIsEditingApproved] = useState(false);
  const [referentLock, setReferentLock] = useState(initialReferentLock);
  useEffect(() => {
    setReferentLock(initialReferentLock);
  }, [initialReferentLock]);
  const activeReferentLock = isActiveReferentLock(referentLock)
    ? referentLock
    : null;
  const isCurrentReferent = Boolean(activeReferentLock?.isCurrentUser);
  const effectiveCanEdit =
    canEdit && (meetingStatus !== "approved" || isEditingApproved);
  const canEditOfficialMinutes = effectiveCanEdit && isCurrentReferent;
  const officialMinutesLockedMessage = activeReferentLock
    ? activeReferentLock.isCurrentUser
      ? null
      : `Referatfelter er låst, fordi ${activeReferentLock.memberName} er referent.`
    : "Tag rollen som referent for at redigere de officielle referatfelter.";

  const meetingDraft: MeetingMinutesDraft = {
    minutesText,
    decisions,
    internalNote,
    status: meetingStatus,
  };

  async function persistMeetingDraft(
    draft: MeetingMinutesDraft,
    expectedUpdatedAt: string | null,
  ) {
    return readResponse<{
      minutes: MeetingMinutes;
      message: string;
    }>(
      await fetch(`/api/meetings/${meetingId}/minutes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          committeeId,
          expectedUpdatedAt,
          minutesText: draft.minutesText,
          decisions: draft.decisions,
          internalNote: draft.internalNote || null,
          status: draft.status,
        }),
      }),
    );
  }

  const meetingAutosave = useOfflineAutosave({
    storageKey: `committee-minutes:v1:${userId}:${organizationId}:${committeeId}:${meetingId}:meeting`,
    data: meetingDraft,
    serverUpdatedAt: initialMeetingMinutes?.updated_at ?? null,
    enabled: canEditOfficialMinutes,
    save: persistMeetingDraft,
    restore: (draft) => {
      setMinutesText(draft.minutesText);
      setDecisions(draft.decisions);
      setInternalNote(draft.internalNote);
      setMeetingStatus(draft.status);
    },
    onSaved: (result) => {
      setMinutes(result.minutes);
      setMeetingStatus(result.minutes.status);
      setError(null);
      setFieldErrors({});
    },
    onError: (caughtError) => {
      const typedError = caughtError as Error & { fieldErrors?: FieldErrors };
      setError(typedError.message);
      setFieldErrors(typedError.fieldErrors || {});
    },
    getSavedServerUpdatedAt: (result) => result.minutes.updated_at,
  });

  useEffect(() => {
    if (meetingAutosave.conflict || error) {
      setIsGeneralMinutesOpen(true);
    }
  }, [error, meetingAutosave.conflict]);

  useEffect(() => {
    if (
      initialMeetingMinutes &&
      isNewerServerVersion(
        initialMeetingMinutes.updated_at,
        minutes?.updated_at,
      )
    ) {
      setMinutes(initialMeetingMinutes);
      setMeetingStatus(initialMeetingMinutes.status);
      if (initialMeetingMinutes.status === "approved") {
        setIsEditingApproved(false);
      }
    }
  }, [initialMeetingMinutes, minutes?.updated_at]);

  async function saveMeetingMinutes(status: MinutesStatus) {
    if (!canEditOfficialMinutes) {
      setIsGeneralMinutesOpen(true);
      setError(
        officialMinutesLockedMessage ??
          "Tag rollen som referent for at gemme referatet.",
      );
      return;
    }
    setSavingStatus(status);
    setMessage(null);
    setError(null);
    setFieldErrors({});
    const result = await meetingAutosave.saveNow({
      ...meetingDraft,
      status,
    });
    if (result) {
      setMeetingStatus(result.minutes.status);
      setMessage(
        status === "approved"
          ? "Referatet er godkendt."
          : status === "ready_for_approval"
            ? "Referatet er markeret som klar til godkendelse."
            : result.message,
      );
    }
    setSavingStatus(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <ReferentRoleControl
        canEdit={effectiveCanEdit}
        committeeId={committeeId}
        meetingId={meetingId}
        onChange={setReferentLock}
        organizationId={organizationId}
        referentLock={referentLock}
      />
      <section
        className="order-2 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-sm"
        aria-labelledby="general-minutes-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
          <button
            aria-controls="general-minutes-content"
            aria-expanded={isGeneralMinutesOpen}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            onClick={() => setIsGeneralMinutesOpen((open) => !open)}
            type="button"
          >
            <span
              aria-hidden="true"
              className={`text-sm text-slate-500 transition-transform ${
                isGeneralMinutesOpen ? "rotate-90" : ""
              }`}
            >
              ▶
            </span>
            <span>
              <span
                className="block font-semibold text-ink"
                id="general-minutes-heading"
              >
                Generelt mødereferat
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Samlet referat og beslutninger
              </span>
            </span>
          </button>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {effectiveCanEdit ? (
              <AutosaveStatusLine
                errorMessage={meetingAutosave.errorMessage}
                onRetry={() => void meetingAutosave.retry()}
                status={meetingAutosave.status}
              />
            ) : null}
            <StatusBadge tone={meetingStatusTones[meetingStatus]}>
              {meetingMinutesStatusLabels[meetingStatus]}
            </StatusBadge>
          </div>
        </div>

        <div
          className="border-t border-line p-3"
          hidden={!isGeneralMinutesOpen}
          id="general-minutes-content"
        >
          {canEditOfficialMinutes ? (
            <div
              className="space-y-3.5"
              onBlurCapture={() => void meetingAutosave.flush()}
            >
              <LocalDraftConflict
                draft={meetingAutosave.conflict}
                onKeepServer={meetingAutosave.keepServerVersion}
                onRestore={meetingAutosave.restoreLocalDraft}
              />
              {error ? (
                <div
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  role="alert"
                >
                  <p className="font-semibold">Referatet kunne ikke gemmes</p>
                  <p className="mt-1">{error}</p>
                </div>
              ) : null}
              {message ? (
                <div
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                  role="status"
                >
                  {message}
                </div>
              ) : null}
              <div>
                <label className="label" htmlFor="meeting-minutes-text">
                  Referattekst
                </label>
                <RichTextEditor
                  id="meeting-minutes-text"
                  minHeightClass="min-h-24"
                  onChange={setMinutesText}
                  value={minutesText}
                />
                <MinutesAiAssistant
                  committeeId={committeeId}
                  field="minutes_text"
                  meetingId={meetingId}
                  onApply={setMinutesText}
                  organizationId={organizationId}
                  source="meeting_minutes"
                  value={minutesText}
                />
                {fieldErrors.minutesText?.[0] ? (
                  <p className="mt-1 text-sm text-red-700">
                    {fieldErrors.minutesText[0]}
                  </p>
                ) : null}
              </div>
              <div>
                <label className="label" htmlFor="meeting-decisions">
                  Beslutninger
                </label>
                <RichTextEditor
                  id="meeting-decisions"
                  minHeightClass="min-h-16"
                  onChange={setDecisions}
                  value={decisions}
                />
                <MinutesAiAssistant
                  committeeId={committeeId}
                  field="decisions"
                  meetingId={meetingId}
                  onApply={setDecisions}
                  organizationId={organizationId}
                  source="meeting_minutes"
                  value={decisions}
                />
              </div>
              <details className="group rounded-[var(--radius-control)] border border-line bg-subtle/30">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  <span>Intern note</span>
                  <span className="text-xs font-semibold text-brand">
                    <span className="group-open:hidden">Åbn</span>
                    <span className="hidden group-open:inline">Skjul</span>
                  </span>
                </summary>
                <div className="border-t border-line p-3">
                  <RichTextEditor
                    id="meeting-internal-note"
                    minHeightClass="min-h-14"
                    onChange={setInternalNote}
                    value={internalNote}
                  />
                  <MinutesAiAssistant
                    committeeId={committeeId}
                    field="internal_note"
                    meetingId={meetingId}
                    onApply={setInternalNote}
                    organizationId={organizationId}
                    source="meeting_minutes"
                    value={internalNote}
                  />
                  <p className="mt-1 text-xs text-muted">
                    Kun til interne bemærkninger i referatprocessen.
                  </p>
                </div>
              </details>
              <ActionBar>
                <p className="text-xs text-slate-500">
                  Ændringer gemmes automatisk, mens du skriver.
                </p>
                <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    disabled={
                      savingStatus !== null ||
                      meetingAutosave.status === "saving"
                    }
                    onClick={() => saveMeetingMinutes("draft")}
                    type="button"
                    variant="secondary"
                  >
                    {savingStatus === "draft" ? "Gemmer..." : "Gem som kladde"}
                  </Button>
                </div>
              </ActionBar>
            </div>
          ) : minutes ? (
            <DocumentPanel className="minutes-document space-y-6 border-0 p-0 shadow-none">
              {effectiveCanEdit && officialMinutesLockedMessage ? (
                <div
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                  role="status"
                >
                  {officialMinutesLockedMessage}
                </div>
              ) : null}
              <section className="minutes-document-section">
                <p className="minutes-document-label">Referat</p>
                <RichTextContent
                  className="mt-3 text-base leading-8"
                  value={minutes.minutes_text}
                />
              </section>
              <section className="minutes-decision">
                <p className="minutes-document-label text-success">
                  Samlede beslutninger
                </p>
                <RichTextContent
                  className="mt-3 text-sm leading-7"
                  value={minutes.decisions}
                />
              </section>
              {canEditOfficialMinutes && meetingStatus === "approved" ? (
                <Button
                  onClick={() => setIsEditingApproved(true)}
                  type="button"
                  variant="secondary"
                >
                  Rediger referat
                </Button>
              ) : null}
            </DocumentPanel>
          ) : (
            <div className="space-y-2 text-sm text-slate-600">
              {effectiveCanEdit && officialMinutesLockedMessage ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                  {officialMinutesLockedMessage}
                </p>
              ) : null}
              <p>Der er endnu ikke et referat, som du har adgang til at se.</p>
            </div>
          )}
          {canEditDecisions ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-xs text-muted">
                Brug det samlede referat som et redigerbart forslag til en
                struktureret beslutning.
              </p>
              <DecisionCreateModal
                agendaItems={occurrences.flatMap((occurrence) =>
                  occurrence.agenda_items
                    ? [
                        {
                          id: occurrence.agenda_items.id,
                          title: occurrence.agenda_items.title,
                        },
                      ]
                    : [],
                )}
                categorySource={decisionCategorySource}
                committeeId={committeeId}
                initialDescription={firstRichTextToPlainText(
                  decisions,
                  minutesText,
                )}
                instanceId="meeting-minutes"
                meetingDate={meetingDate}
                meetingId={meetingId}
                organizationId={organizationId}
                responsiblePeople={responsiblePeople}
                sourceLabel="det generelle mødereferat"
                triggerLabel="Opret beslutning fra referat"
              />
            </div>
          ) : null}
          {canEditTasks ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-xs text-muted">
                Lad AI foreslå konkrete opgaver. Du gennemgår og redigerer hvert
                forslag før oprettelse.
              </p>
              <AiTaskReviewModal
                categorySource={taskCategorySource}
                committeeId={committeeId}
                decisions={meetingDecisions}
                existingTasks={meetingTasks}
                meetingId={meetingId}
                minutesStatus={meetingStatus}
                organizationId={organizationId}
                responsiblePeople={responsiblePeople}
                source="meeting_minutes"
                sourceLabel="det generelle mødereferat"
              />
            </div>
          ) : null}
          <div className="mt-4 border-t border-line pt-4">
            <MinuteAttachments
              attachments={meetingAttachments}
              canEdit={canEditOfficialMinutes}
              committeeId={committeeId}
              meetingId={meetingId}
              organizationId={organizationId}
            />
          </div>
        </div>
      </section>

      <MinutesApprovalPanel
        className="order-3"
        approvals={approvals}
        canApprove={canApprove}
        canEdit={canEdit}
        committeeId={committeeId}
        meetingId={meetingId}
        minutes={minutes ?? initialMeetingMinutes}
        organizationId={organizationId}
        userId={userId}
      />

      <section aria-labelledby="agenda-minutes-heading" className="order-1">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-2.5">
          <div>
            <p className="page-eyebrow">Dagsorden</p>
            <h3 className="section-title mt-1" id="agenda-minutes-heading">
              Referat pr. dagsordenspunkt
            </h3>
            <p className="metadata mt-1">
              Åbn et punkt for at læse eller redigere dets referat.
            </p>
          </div>
          <div className="flex flex-wrap items-end justify-end gap-3">
            <span className="text-sm font-medium text-muted">
              {occurrences.length}{" "}
              {occurrences.length === 1 ? "punkt" : "punkter"}
            </span>
            {effectiveCanEdit && occurrences.length > 1 ? (
              <AgendaReorderModal
                committeeId={committeeId}
                meetingId={meetingId}
                occurrences={occurrences}
                organizationId={organizationId}
              />
            ) : null}
            {canEditTasks ? (
              <AiTaskReviewModal
                categorySource={taskCategorySource}
                committeeId={committeeId}
                decisions={meetingDecisions}
                existingTasks={meetingTasks}
                meetingId={meetingId}
                minutesStatus={meetingStatus}
                organizationId={organizationId}
                responsiblePeople={responsiblePeople}
                source="whole_meeting"
                sourceLabel="hele mødereferatet"
                triggerLabel="Foreslå opgaver fra hele referatet"
              />
            ) : null}
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {occurrences.map((occurrence, index) => (
            <AgendaMinutesCard
              canEdit={canEditOfficialMinutes}
              canEditDecisions={canEditDecisions}
              canEditTasks={canEditTasks}
              committeeId={committeeId}
              decisionCategorySource={decisionCategorySource}
              decisionHistory={
                decisionHistoryByAgendaItem[occurrence.agenda_item_id] ?? {
                  categories: [],
                  decisions: [],
                }
              }
              initialMinutes={
                initialAgendaItemMinutes.find(
                  (candidate) =>
                    candidate.agenda_item_id === occurrence.agenda_item_id,
                ) ?? null
              }
              initialPrivateNote={
                privateAgendaItemNotes.find(
                  (candidate) =>
                    candidate.agenda_item_id === occurrence.agenda_item_id,
                ) ?? null
              }
              key={occurrence.id}
              meetingId={meetingId}
              meetingDate={meetingDate}
              meetingDecisions={meetingDecisions}
              meetingTasks={meetingTasks}
              minutesStatus={meetingStatus}
              occurrence={occurrence}
              displayNumber={index + 1}
              organizationId={organizationId}
              previousMeetingMinutes={previousMeetingMinutes}
              attachments={agendaItemAttachments.filter(
                (attachment) =>
                  attachment.agendaItemId === occurrence.agenda_item_id,
              )}
              userId={userId}
              responsiblePeople={responsiblePeople}
              taskCategorySource={taskCategorySource}
              root={root}
            />
          ))}
          {occurrences.length === 0 ? (
            <EmptyState title="Mødet har endnu ingen dagsordenspunkter." />
          ) : null}
        </div>
      </section>
    </div>
  );
}
