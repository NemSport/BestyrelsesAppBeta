"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

import { AppIcon } from "@/components/icons/app-icon";
import { AgendaItemHistoryLink } from "@/components/agenda-items/agenda-item-history-link";
import { AgendaItemHistoryReadMode } from "@/components/agenda-items/agenda-item-history-read-mode";
import { EditAgendaItemModal } from "@/components/agenda-items/edit-agenda-item-modal";
import { DecisionCreateModal } from "@/components/decisions/decision-create-modal";
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
  buttonClassName,
  DocumentPanel,
  EmptyState,
  Input,
  Modal,
  Select,
  StatusBadge,
  type StatusTone,
} from "@/components/ui";
import { useOfflineAutosave } from "@/hooks/use-offline-autosave";
import { useDismissibleDetails } from "@/hooks/use-dismissible-details";
import {
  agendaItemMinutesNeedsAction,
  agendaItemMinutesStatusOptions,
  normalizeAgendaItemMinutesStatus,
  shouldSuggestAgendaItemTransfer,
} from "@/lib/agenda-item-minutes";
import {
  agendaItemMinutesStatusLabels,
  agendaItemTypeLabels,
  formatDate,
  formatDateTime,
  meetingMinutesStatusLabels,
  standardAgendaItemLabels,
} from "@/lib/localization";
import {
  getAgendaItemHref,
  getMeetingAgendaPointHref,
} from "@/lib/meeting-navigation";
import type { AgendaItemHistoryMetadata } from "@/lib/agenda-item-history";
import { firstRichTextToPlainText, richTextToPlainText } from "@/lib/rich-text";
import { taskStatusLabels, taskStatusTones } from "@/lib/tasks";
import { mergeTransferredTaskReferences } from "@/lib/transferred-task-references";
import type { Database } from "@/types/database";
import type {
  AgendaItemMinutes,
  AgendaItemPrivateNote,
  DecisionView,
  IncomingTransferredAgendaItemView,
  MeetingMinutes,
  MeetingMinutesReferentLock,
  MeetingWithAgenda,
  MinutesResponsiblePerson,
  MeetingMinuteApprovalView,
  MinuteAttachmentView,
  PreviousMeetingMinutesReference,
  TaskView,
} from "@/types/domain";
import type {
  MeetingDocumentContext,
  RelatedDocumentView,
} from "@/types/documents";

type MinutesStatus = Database["public"]["Enums"]["meeting_minutes_status"];
type AgendaMinutesStatus =
  Database["public"]["Enums"]["agenda_item_minutes_status"];
type AgendaOccurrence = MeetingWithAgenda["agenda_item_occurrences"][number];
type FieldErrors = Record<string, string[] | undefined>;
type AgendaActionPanel = "followUp" | "more" | null;
type AgendaMinutesDraft = {
  notes: string;
  decision: string;
  followUp: string;
  responsibleUserId: string;
  deadline: string;
  status: AgendaMinutesStatus;
};

const flushActiveAgendaDraftEvent = "meeting-minutes:flush-active-draft";

type AgendaPrivateNoteDraft = {
  content: string;
};

type MeetingMinutesDraft = {
  minutesText: string;
  decisions: string;
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

function normalizeReadModeContent(value: string | null | undefined) {
  return richTextToPlainText(value)
    .replace(/^(?:noter|referat)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("da-DK");
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

  const sendReferentAction = useCallback(
    async (action: "claim" | "heartbeat" | "release") => {
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
    },
    [committeeId, meetingId, onChange, organizationId],
  );

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

  if (!canEdit) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        <AppIcon name={isCurrentReferent ? "edit" : "privateNotes"} size={14} />
        <span className="font-semibold text-ink">Referent:</span>
        <span>
          {activeLock
            ? activeLock.isCurrentUser
              ? "Dig"
              : activeLock.memberName
            : "Ingen aktiv"}
        </span>
      </span>
      {canEdit ? (
        isCurrentReferent ? (
          <button
            className="rounded-[var(--radius-control)] px-2 py-1 text-xs font-semibold text-muted hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            disabled={pendingAction !== null}
            onClick={() => void handleAction("release")}
            type="button"
          >
            {pendingAction === "release" ? "Afgiver..." : "Afgiv"}
          </button>
        ) : (
          <button
            className="rounded-[var(--radius-control)] border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
            disabled={pendingAction !== null || Boolean(activeLock)}
            onClick={() => void handleAction("claim")}
            type="button"
          >
            {pendingAction === "claim" ? "Tager rolle..." : "Bliv referent"}
          </button>
        )
      ) : null}
      {message ? (
        <span className="font-medium text-success">{message}</span>
      ) : null}
      {error ? (
        <span className="font-medium text-danger" role="alert">
          {error}
        </span>
      ) : null}
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

function PrivateNoteEditor({
  organizationId,
  userId,
  committeeId,
  meetingId,
  agendaItemId,
  initialPrivateNote,
  compact = false,
}: {
  organizationId: string;
  userId: string;
  committeeId: string;
  meetingId: string;
  agendaItemId: string | null;
  initialPrivateNote: AgendaItemPrivateNote | null;
  compact?: boolean;
}) {
  const [privateNote, setPrivateNote] = useState(initialPrivateNote);
  const [content, setContent] = useState(initialPrivateNote?.content ?? "");
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
        agendaItemId
          ? `/api/meetings/${meetingId}/agenda-items/${agendaItemId}/private-note`
          : `/api/meetings/${meetingId}/private-note`,
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
    storageKey: `private-note:v2:${userId}:${organizationId}:${committeeId}:${meetingId}:${agendaItemId ? `agenda:${agendaItemId}` : "meeting"}`,
    data: privateNoteDraft,
    serverUpdatedAt: privateNote?.updated_at ?? null,
    enabled: true,
    save: persistPrivateNote,
    restore: (draft) => setContent(draft.content),
    onSaved: (result) => {
      setPrivateNote(result.note);
    },
    getSavedServerUpdatedAt: (result) => result.note.updated_at,
    debounceMs: 1200,
  });

  return (
    <div
      className={clsx(
        "rounded-[var(--radius-control)]",
        compact
          ? "space-y-1.5 bg-transparent p-0"
          : "space-y-3 border border-line bg-subtle/40 p-3",
      )}
      onBlurCapture={() => void autosave.flush()}
    >
      {compact ? null : (
        <div>
          <p className="text-sm font-semibold">Intern note</p>
          <p className="mt-1 text-xs text-muted">
            Kun du kan se disse noter. De bliver ikke en del af referatet,
            dagsordenen, PDF-eksporter eller fælles AI-opsummeringer.
          </p>
        </div>
      )}
      <LocalDraftConflict
        draft={autosave.conflict}
        onKeepServer={autosave.keepServerVersion}
        onRestore={autosave.restoreLocalDraft}
      />
      <div
        className={clsx(
          compact &&
            "rounded-[var(--radius-control)] bg-surface/45 [&>div]:border-0 [&>div]:bg-transparent [&>div]:shadow-none",
        )}
      >
        <RichTextEditor
          compactToolbar={compact}
          id={`private-note-${agendaItemId ?? "meeting"}`}
          minHeightClass="min-h-24"
          onChange={setContent}
          placeholder="Skriv dine egne noter her…"
          value={content}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AutosaveStatusLine
          errorMessage={autosave.errorMessage}
          lastSavedAt={autosave.lastSavedAt}
          onRetry={() => void autosave.retry()}
          savedLabel="Gemt"
          status={autosave.status}
        />
        {compact ? null : (
          <Button
            disabled={autosave.status === "saving"}
            onClick={() => void autosave.saveNow()}
            size="sm"
            type="button"
            variant="secondary"
          >
            {autosave.status === "saving" ? "Gemmer..." : "Gem intern note"}
          </Button>
        )}
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
  editorLockAction,
  editorLockedMessage,
  initialMinutes,
  initialPrivateNote,
  meetingPrivateNote,
  showMeetingPrivateNote = false,
  responsiblePeople,
  previousMeetingMinutes,
  attachments,
  relatedDocuments = [],
  canEdit,
  canUploadAttachment = canEdit,
  canEditAgendaItem,
  canEditPrivateNotes = true,
  canEditDecisions,
  canEditTasks,
  meetingDate,
  meetingDecisions,
  meetingTasks,
  decisionCategorySource,
  taskCategorySource,
  decisionHistory,
  minutesStatus,
  incomingTransfers = [],
  meetingTitle = "Aktuelt møde",
  isActive = false,
  historyMetadata = null,
  onDraftChange,
  onStatusChange,
}: {
  organizationId: string;
  userId: string;
  committeeId: string;
  meetingId: string;
  root: string;
  occurrence: AgendaOccurrence;
  displayNumber: number;
  editorLockAction?: ReactNode;
  editorLockedMessage?: string | null;
  initialMinutes: AgendaItemMinutes | null;
  initialPrivateNote: AgendaItemPrivateNote | null;
  meetingPrivateNote?: AgendaItemPrivateNote | null;
  showMeetingPrivateNote?: boolean;
  responsiblePeople: MinutesResponsiblePerson[];
  previousMeetingMinutes: PreviousMeetingMinutesReference;
  attachments: MinuteAttachmentView[];
  relatedDocuments?: RelatedDocumentView[];
  canEdit: boolean;
  canUploadAttachment?: boolean;
  canEditAgendaItem: boolean;
  canEditPrivateNotes?: boolean;
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
  incomingTransfers?: IncomingTransferredAgendaItemView[];
  meetingTitle?: string;
  isActive?: boolean;
  historyMetadata?: AgendaItemHistoryMetadata | null;
  onDraftChange?: (agendaItemId: string, draft: AgendaMinutesDraft) => void;
  onStatusChange?: (agendaItemId: string, status: AgendaMinutesStatus) => void;
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
  const [isEditingMinutes, setIsEditingMinutes] = useState(canEdit);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [activeActionPanel, setActiveActionPanel] =
    useState<AgendaActionPanel>(null);
  const moreActionsRef = useRef<HTMLDetailsElement>(null);
  useDismissibleDetails(moreActionsRef);
  const [deleting, setDeleting] = useState(false);
  const [markingCompleted, setMarkingCompleted] = useState(false);
  const transferStatusRef = useRef<AgendaMinutesStatus | null>(
    initialMinutes &&
      shouldSuggestAgendaItemTransfer(itemType, initialMinutes.status)
      ? initialMinutes.status
      : null,
  );

  const draftData = useMemo<AgendaMinutesDraft>(
    () => ({
      notes,
      decision,
      followUp,
      responsibleUserId,
      deadline,
      status,
    }),
    [deadline, decision, followUp, notes, responsibleUserId, status],
  );

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
      onStatusChange?.(item.id, result.minutes.status);
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

  const flushAutosave = autosave.flush;

  useEffect(() => {
    onDraftChange?.(item.id, draftData);
  }, [draftData, item.id, onDraftChange]);

  useEffect(() => {
    if (!isActive || !canEdit) return;

    function flushBeforePointChange() {
      void flushAutosave();
    }

    window.addEventListener(
      flushActiveAgendaDraftEvent,
      flushBeforePointChange,
    );
    return () =>
      window.removeEventListener(
        flushActiveAgendaDraftEvent,
        flushBeforePointChange,
      );
  }, [canEdit, flushAutosave, isActive]);

  useEffect(() => {
    setStatus((currentStatus) =>
      normalizeAgendaItemMinutesStatus(itemType, currentStatus),
    );
  }, [itemType]);

  useEffect(() => {
    if (canEdit) setIsEditingMinutes(true);
  }, [canEdit]);

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

  async function markAgendaItemCompleted() {
    const completedStatus = completedAgendaStatusForType(itemType);
    if (!canEdit || !completedStatus || isCompletedAgendaStatus(status)) return;

    setMarkingCompleted(true);
    setStatus(completedStatus);
    onStatusChange?.(item.id, completedStatus);
    const result = await autosave.saveNow({
      ...draftData,
      status: completedStatus,
    });
    if (result) {
      setStatus(result.minutes.status);
      setMessage("Punktet er markeret som behandlet.");
    }
    setMarkingCompleted(false);
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
    (person) =>
      person.id === (responsibleUserId || minutes?.responsible_user_id),
  );
  const isStandardItem = item.standard_key !== null;
  const incomingTransfer = incomingTransfers.find(
    (transfer) => transfer.targetAgendaItemId === item.id,
  );
  const isTransferredItem =
    item.parent_id !== null || Boolean(incomingTransfer);
  const isAnyOtherBusiness = item.standard_key === "any_other_business";
  const requiresAction = agendaItemMinutesNeedsAction(
    itemType,
    status,
    followUp,
  );
  const relatedDecisions = meetingDecisions.filter(
    (relatedDecision) => relatedDecision.agenda_item_id === item.id,
  );
  const currentRelatedTasks = meetingTasks.filter(
    (relatedTask) => relatedTask.agenda_item_id === item.id,
  );
  const relatedTasks = mergeTransferredTaskReferences(
    currentRelatedTasks,
    incomingTransfer?.sourceTasks ?? [],
  );
  const transferSourceMeeting = incomingTransfer?.sourceMeeting;
  const taskOrigins = Object.fromEntries(
    (incomingTransfer?.sourceTasks ?? []).flatMap((task) =>
      transferSourceMeeting
        ? [
            [
              task.id,
              {
                meeting: {
                  id: transferSourceMeeting.id,
                  title: transferSourceMeeting.title,
                  startsAt: transferSourceMeeting.starts_at,
                },
              },
            ] as const,
          ]
        : [],
    ),
  );
  const followUpText = firstRichTextToPlainText(followUp).trim();
  const hasFollowUpCaptured = Boolean(followUpText || relatedTasks.length > 0);
  const continuationIndicated =
    mentionsContinuationToNextMeeting(notes, decision) ||
    shouldSuggestAgendaItemTransfer(itemType, status);
  const shouldHighlightFollowUp = continuationIndicated && !hasFollowUpCaptured;
  const shouldConfirmFollowUp = continuationIndicated && hasFollowUpCaptured;
  const notesWordCount = firstRichTextToPlainText(notes)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const statusOptions = agendaItemMinutesStatusOptions[itemType];
  const completedStatus = completedAgendaStatusForType(itemType);
  const fieldGuidance = agendaMinutesFieldGuidance[itemType];
  const primaryAttachment = attachments[0] ?? null;

  return (
    <article
      aria-labelledby={`agenda-point-${occurrence.id}-heading`}
      className={clsx(
        "scroll-mt-24 overflow-hidden rounded-[var(--radius-panel)] border border-line/80 bg-surface xl:rounded-none xl:border-0",
        isStandardItem && "bg-subtle/20",
        isTransferredItem && "border-l-[3px] border-l-progress/50",
        isAnyOtherBusiness && "border-dashed",
      )}
      id={`agenda-point-${occurrence.id}`}
    >
      <header
        className={clsx(
          "flex flex-col gap-2 border-b border-line/70 bg-surface px-3 py-3",
          isStandardItem && "bg-subtle/60",
        )}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <h3
            className={clsx(
              "flex min-w-0 items-start gap-2 break-words text-xl font-semibold leading-7 text-ink",
              isAnyOtherBusiness && "italic",
            )}
            id={`agenda-point-${occurrence.id}-heading`}
            tabIndex={-1}
          >
            <span className="mt-0.5 shrink-0 rounded bg-brand-soft px-1.5 py-0.5 text-[0.65rem] font-bold uppercase leading-4 tracking-wide text-brand">
              {displayNumber}. {agendaItemTypeLabels[item.item_type].short}
            </span>
            <span>{item.title}</span>
          </h3>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {item.standard_key ? (
              <StatusBadge>
                {standardAgendaItemLabels[item.standard_key]}
              </StatusBadge>
            ) : null}
            {isTransferredItem ? (
              <StatusBadge tone="progress">Overført punkt</StatusBadge>
            ) : null}
            {canEditAgendaItem ? (
              <AgendaItemHistoryLink
                agendaItemId={item.id}
                committeeId={committeeId}
                currentTitle={item.title}
                organizationId={organizationId}
                triggerVariant="compact"
              />
            ) : null}
          </div>
          {incomingTransfer?.sourceMeeting ? (
            <button
              className="mt-2 inline-flex min-h-8 items-center break-words rounded-[var(--radius-control)] border border-progress/25 bg-surface/75 px-2.5 py-1 text-xs font-semibold text-progress hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              onClick={() => setSourceModalOpen(true)}
              type="button"
            >
              Videreført fra {incomingTransfer.sourceMeeting.title}
              {incomingTransfer.sourceOccurrence
                ? ` · Punkt ${incomingTransfer.sourceOccurrence.position}`
                : ""}
            </button>
          ) : null}
          {item.objective || item.description ? (
            <details className="group mt-1 text-xs text-muted">
              <summary className="inline-flex cursor-pointer list-none font-medium hover:text-ink [&::-webkit-details-marker]:hidden">
                Punktbeskrivelse
              </summary>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-muted">
                {item.objective || item.description}
              </p>
            </details>
          ) : null}
        </div>
        <div className="grid grid-cols-2 items-start gap-x-3 gap-y-2 border-t border-line/60 pt-2 sm:flex sm:flex-wrap sm:gap-x-4">
          {!isStandardItem ? (
            <div className="flex min-w-0 items-start gap-1.5 sm:min-w-32">
              <AppIcon
                className="mt-0.5 shrink-0 text-muted"
                name="members"
                size={14}
              />
              <div className="min-w-0">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
                  Ansvarlig
                </p>
                <p className="break-words text-xs font-medium text-ink">
                  {responsible?.name || "Ingen ansvarlig"}
                </p>
              </div>
            </div>
          ) : null}
          {!isStandardItem ? (
            <div className="flex min-w-0 items-start gap-1.5 sm:min-w-28">
              <AppIcon
                className="mt-0.5 shrink-0 text-muted"
                name="calendar"
                size={14}
              />
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
                  Deadline
                </p>
                <p className="text-xs font-medium text-ink">
                  {deadline ? formatDate(deadline) : "Ingen deadline"}
                </p>
              </div>
            </div>
          ) : null}
          <div className="flex min-w-0 items-start gap-1.5 sm:min-w-32">
            <AppIcon
              className="mt-0.5 shrink-0 text-muted"
              name="attachments"
              size={14}
            />
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
                Materiale
              </p>
              {primaryAttachment ? (
                <p className="flex min-w-0 items-center gap-1 text-xs font-medium">
                  <a
                    className="max-w-48 truncate text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    href={`/api/minutes-attachments/${primaryAttachment.id}/download`}
                    rel="noopener noreferrer"
                    target="_blank"
                    title={primaryAttachment.fileName}
                  >
                    {primaryAttachment.fileName}
                  </a>
                  {attachments.length > 1 ? (
                    <span className="shrink-0 text-muted">
                      +{attachments.length - 1}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-xs font-medium text-muted">Ingen bilag</p>
              )}
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-1.5 sm:min-w-28">
            <AppIcon
              className="mt-0.5 shrink-0 text-muted"
              name={agendaStatusIconName(status)}
              size={14}
            />
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
                Status
              </p>
              <p className="text-xs font-medium text-ink">
                {agendaItemMinutesStatusLabels[status]}
              </p>
            </div>
          </div>
          {canEdit && completedStatus && !isCompletedAgendaStatus(status) ? (
            <button
              className="col-span-2 inline-flex min-h-8 items-center justify-center gap-1.5 self-center rounded-[var(--radius-control)] border border-success/30 bg-surface px-2.5 py-1 text-xs font-semibold text-success transition hover:bg-success-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-60 sm:col-span-1"
              disabled={markingCompleted || autosave.status === "saving"}
              onClick={() => void markAgendaItemCompleted()}
              type="button"
            >
              <AppIcon aria-hidden="true" name="preparation" size={14} />
              {markingCompleted ? "Markerer…" : "Markér som behandlet"}
            </button>
          ) : null}
          {minutes?.updated_at ? (
            <div className="flex min-w-0 items-start gap-1.5 sm:min-w-32">
              <AppIcon
                className="mt-0.5 shrink-0 text-muted"
                name="edit"
                size={14}
              />
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
                  Sidst opdateret
                </p>
                <p className="text-xs font-medium text-ink">
                  {formatDateTime(minutes.updated_at)}
                </p>
              </div>
            </div>
          ) : null}
          {!canEdit || editorLockAction ? (
            <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted sm:col-span-1">
              {!canEdit ? (
                <>
                  <AppIcon className="shrink-0" name="privateNotes" size={14} />
                  <span>
                    {editorLockedMessage ??
                      "Du skal være referent for at redigere det officielle referat"}
                  </span>
                </>
              ) : null}
              {editorLockAction}
            </div>
          ) : null}
          <Link
            className="self-center text-xs font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            href={getAgendaItemHref({
              organizationId,
              committeeId,
              agendaItemId: item.id,
            })}
          >
            Åbn punkt
          </Link>
        </div>
      </header>

      {incomingTransfer ? (
        <Modal
          description={
            incomingTransfer.sourceMeeting
              ? `${incomingTransfer.sourceMeeting.title} · ${formatDate(
                  incomingTransfer.sourceMeeting.starts_at,
                )}`
              : undefined
          }
          eyebrow="Oprindeligt dagsordenspunkt"
          footer={
            incomingTransfer.sourceMeeting ? (
              <div className="flex justify-end">
                <Link
                  className={buttonClassName({ variant: "secondary" })}
                  href={getMeetingAgendaPointHref({
                    organizationId,
                    committeeId,
                    meetingId: incomingTransfer.sourceMeeting.id,
                    occurrenceId: incomingTransfer.sourceOccurrence?.id,
                  })}
                >
                  Åbn oprindeligt møde
                </Link>
              </div>
            ) : null
          }
          maxWidth="3xl"
          onClose={() => setSourceModalOpen(false)}
          open={sourceModalOpen}
          title={incomingTransfer.sourceAgendaItem?.title ?? "Overført punkt"}
        >
          <div className="space-y-5">
            <dl className="grid gap-3 rounded-[var(--radius-control)] border border-line bg-subtle/35 p-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Punkt
                </dt>
                <dd className="mt-1 text-sm font-semibold text-ink">
                  {incomingTransfer.sourceOccurrence?.position ??
                    "Ikke angivet"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Type
                </dt>
                <dd className="mt-1 text-sm font-semibold text-ink">
                  {incomingTransfer.sourceAgendaItem
                    ? `${
                        agendaItemTypeLabels[
                          incomingTransfer.sourceAgendaItem.item_type
                        ].short
                      } · ${
                        agendaItemTypeLabels[
                          incomingTransfer.sourceAgendaItem.item_type
                        ].label
                      }`
                    : "Ikke angivet"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Status ved overførsel
                </dt>
                <dd className="mt-1 text-sm font-semibold text-ink">
                  {agendaItemMinutesStatusLabels[incomingTransfer.sourceStatus]}
                </dd>
              </div>
            </dl>

            {incomingTransfer.sourceAgendaItem?.description ||
            incomingTransfer.sourceAgendaItem?.objective ? (
              <section
                aria-labelledby={`source-description-${incomingTransfer.id}`}
              >
                <h3
                  className="text-sm font-semibold text-ink"
                  id={`source-description-${incomingTransfer.id}`}
                >
                  Beskrivelse / sagsfremstilling
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink">
                  {incomingTransfer.sourceAgendaItem.description ||
                    incomingTransfer.sourceAgendaItem.objective}
                </p>
              </section>
            ) : null}

            {incomingTransfer.sourceMinutes &&
            firstRichTextToPlainText(
              incomingTransfer.sourceMinutes.notes,
              incomingTransfer.sourceMinutes.decision,
              incomingTransfer.sourceMinutes.follow_up,
            ).trim() ? (
              <section
                aria-labelledby={`source-minutes-${incomingTransfer.id}`}
                className="space-y-4 border-t border-line pt-5"
              >
                <h3
                  className="text-sm font-semibold text-ink"
                  id={`source-minutes-${incomingTransfer.id}`}
                >
                  Eksisterende referat
                </h3>
                {incomingTransfer.sourceMinutes.notes ? (
                  <div>
                    <p className="minutes-document-label">Noter</p>
                    <RichTextContent
                      className="mt-2 text-sm leading-7"
                      value={incomingTransfer.sourceMinutes.notes}
                    />
                  </div>
                ) : null}
                {incomingTransfer.sourceMinutes.decision ? (
                  <div className="minutes-decision">
                    <p className="minutes-document-label text-success">
                      Beslutning
                    </p>
                    <RichTextContent
                      className="mt-2 text-sm leading-7"
                      value={incomingTransfer.sourceMinutes.decision}
                    />
                  </div>
                ) : null}
                {incomingTransfer.sourceMinutes.follow_up ? (
                  <div className="minutes-follow-up">
                    <p className="minutes-document-label text-warning">
                      Opfølgning
                    </p>
                    <RichTextContent
                      className="mt-2 text-sm leading-7"
                      value={incomingTransfer.sourceMinutes.follow_up}
                    />
                  </div>
                ) : null}
              </section>
            ) : null}

            {incomingTransfer.sourceTasks.length > 0 ? (
              <section
                aria-labelledby={`source-tasks-${incomingTransfer.id}`}
                className="border-t border-line pt-5"
              >
                <h3
                  className="text-sm font-semibold text-ink"
                  id={`source-tasks-${incomingTransfer.id}`}
                >
                  Tilknyttede opgaver
                </h3>
                <div className="mt-2 divide-y divide-line border-y border-line">
                  {incomingTransfer.sourceTasks.map((task) => (
                    <article
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
                      key={task.id}
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-ink">
                          {task.title}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {task.responsible?.full_name || "Ingen ansvarlig"}
                          {task.deadline
                            ? ` · Deadline ${formatDate(task.deadline)}`
                            : " · Ingen deadline"}
                        </p>
                      </div>
                      <StatusBadge tone={taskStatusTones[task.status]}>
                        {taskStatusLabels[task.status]}
                      </StatusBadge>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </Modal>
      ) : null}

      <div className="xl:grid xl:grid-cols-[minmax(0,27fr)_minmax(16rem,14fr)] xl:items-start">
        <div className="min-w-0">
          {item.standard_key === "previous_minutes_approval" ? (
            <PreviousMinutesReference
              reference={previousMeetingMinutes}
              root={root}
            />
          ) : null}

          {canEdit && !isEditingMinutes ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-3 sm:px-5">
              <Button
                onClick={() => {
                  setActiveActionPanel(null);
                  setIsEditingMinutes(true);
                }}
                type="button"
              >
                Rediger referat
              </Button>
              <details className="group relative" ref={moreActionsRef}>
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-[var(--radius-control)] border border-line bg-surface px-4 py-2 text-sm font-semibold text-muted transition hover:bg-subtle hover:text-ink [&::-webkit-details-marker]:hidden">
                  Flere handlinger
                </summary>
                <div className="absolute left-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] space-y-3 rounded-[var(--radius-panel)] border border-line bg-surface p-3 shadow-lg sm:left-auto sm:right-0">
                  <div>
                    <EditAgendaItemModal
                      committeeId={committeeId}
                      compact
                      item={item}
                      organizationId={organizationId}
                    />
                  </div>
                </div>
              </details>
            </div>
          ) : null}

          {canEdit && isEditingMinutes ? (
            <form
              className="space-y-2 p-3"
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
                <p className="text-xs font-medium text-success" role="status">
                  {message}
                </p>
              ) : null}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      className="text-sm font-semibold text-ink"
                      htmlFor={`notes-${occurrence.id}`}
                    >
                      Referat, synspunkter og drøftelse
                    </label>
                    <details className="group relative text-xs text-muted">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded px-1.5 py-1 font-medium text-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
                        <AppIcon aria-hidden="true" name="edit" size={13} />
                        Skrivehjælp
                      </summary>
                      <div className="absolute left-0 z-20 mt-1.5 w-[min(22rem,calc(100vw-2rem))] rounded-[var(--radius-control)] border border-line bg-surface p-2.5 text-xs leading-4 text-muted shadow-lg">
                        <p>
                          Skriv det væsentlige fra behandlingen af punktet. Brug
                          feltet til orienteringer, drøftelser, baggrund og
                          vigtige pointer.
                        </p>
                        <p className="mt-1 font-medium text-ink">
                          {fieldGuidance.notes}
                        </p>
                      </div>
                    </details>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label
                      className="text-[0.68rem] font-semibold text-muted"
                      htmlFor={`status-${occurrence.id}`}
                    >
                      Status
                    </label>
                    <Select
                      aria-describedby={
                        fieldErrors.status?.[0]
                          ? `status-${occurrence.id}-error`
                          : undefined
                      }
                      aria-invalid={Boolean(fieldErrors.status?.[0])}
                      className="min-h-7 w-auto min-w-36 py-0.5 text-xs"
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
                  </div>
                </div>
                <RichTextEditor
                  footer={
                    <>
                      <AutosaveStatusLine
                        errorMessage={autosave.errorMessage}
                        lastSavedAt={autosave.lastSavedAt}
                        onRetry={() => void autosave.retry()}
                        status={autosave.status}
                      />
                      <span className="ml-auto text-xs tabular-nums text-muted">
                        {notesWordCount} ord
                      </span>
                    </>
                  }
                  id={`notes-${occurrence.id}`}
                  minHeightClass="min-h-[18rem] xl:min-h-[20rem]"
                  onChange={setNotes}
                  value={notes}
                />
                {fieldErrors.notes?.[0] ? (
                  <p className="mt-1 text-sm text-red-700">
                    {fieldErrors.notes[0]}
                  </p>
                ) : null}
                {fieldErrors.status?.[0] ? (
                  <p
                    className="text-xs text-danger"
                    id={`status-${occurrence.id}-error`}
                  >
                    {fieldErrors.status[0]}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2 rounded-[var(--radius-control)] bg-subtle/25 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    aria-expanded={activeActionPanel === "followUp"}
                    aria-label={
                      shouldHighlightFollowUp
                        ? "Punktet ser ud til at fortsætte. Opret opfølgning."
                        : undefined
                    }
                    className={clsx(
                      "min-h-8 rounded-[var(--radius-control)] border px-2.5 py-1 text-xs font-semibold transition",
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
                      "min-h-8 rounded-[var(--radius-control)] border px-2.5 py-1 text-xs font-semibold transition",
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
                          Vælg en status ovenfor, der markerer videre
                          behandling.
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
                            Ansvarlig{" "}
                            {requiresAction ? "(påkrævet)" : "(valgfri)"}
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
                            Deadline{" "}
                            {requiresAction ? "(påkrævet)" : "(valgfri)"}
                          </label>
                          <Input
                            aria-describedby={
                              fieldErrors.deadline?.[0]
                                ? `deadline-${occurrence.id}-error`
                                : undefined
                            }
                            aria-invalid={Boolean(fieldErrors.deadline?.[0])}
                            id={`deadline-${occurrence.id}`}
                            onChange={(event) =>
                              setDeadline(event.target.value)
                            }
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
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/60 pt-1.5">
                <Button
                  onClick={() => {
                    void autosave.flush();
                    setActiveActionPanel(null);
                    setIsEditingMinutes(false);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Luk redigering
                </Button>
                <Button
                  disabled={deleting || autosave.status === "saving"}
                  size="sm"
                  type="submit"
                >
                  {autosave.status === "saving"
                    ? "Gemmer…"
                    : "Gem punktreferat"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="minutes-document space-y-2 p-3">
              <div>
                <p className="minutes-document-label">
                  Referat, synspunkter og drøftelse
                </p>
                <div className="mt-1 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-sm">
                  <div className="min-h-[18rem] p-3 xl:min-h-[20rem]">
                    <RichTextContent
                      className="text-sm leading-7"
                      emptyText="Referatet er endnu ikke påbegyndt."
                      value={minutes?.notes}
                    />
                  </div>
                  <div className="flex min-h-9 items-center justify-end border-t border-line bg-subtle/35 px-3 py-1.5">
                    <span className="text-xs tabular-nums text-muted">
                      {notesWordCount} ord
                    </span>
                  </div>
                </div>
              </div>
              {minutes?.decision || minutes?.follow_up ? (
                <details className="group rounded-[var(--radius-control)] border border-line bg-subtle/30">
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
            </div>
          )}
          {attachments.length > 0 || canEdit ? (
            <details className="group border-t border-line/70 bg-subtle/20">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                <AppIcon className="text-muted" name="attachments" size={15} />
                Bilag
                <span className="font-normal">({attachments.length})</span>
                <AppIcon
                  className="ml-auto transition group-open:rotate-180"
                  name="chevronDown"
                  size={14}
                />
              </summary>
              <div className="border-t border-line/70 p-3">
                <MinuteAttachments
                  agendaItemId={item.id}
                  attachments={attachments}
                  relatedDocuments={relatedDocuments}
                  canEdit={canEdit}
                  canUpload={canUploadAttachment}
                  committeeId={committeeId}
                  parentMinutesId={minutes?.id ?? null}
                  meetingId={meetingId}
                  organizationId={organizationId}
                />
              </div>
            </details>
          ) : null}
        </div>

        <aside
          aria-label="Kontekst for aktivt dagsordenspunkt"
          className="workspace-scrollbar border-t border-line/70 bg-subtle/15 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:border-l xl:border-t-0"
        >
          <section
            className="border-b border-line/70 p-2.5"
            aria-labelledby={`context-decisions-${occurrence.id}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h4
                className="flex items-center gap-2 text-sm font-semibold text-ink"
                id={`context-decisions-${occurrence.id}`}
              >
                <AppIcon className="text-success" name="decisions" size={16} />
                Beslutninger
                <span className="text-xs font-normal text-muted">
                  {relatedDecisions.length}
                </span>
              </h4>
              {canEditDecisions ? (
                <DecisionCreateModal
                  agendaItems={[{ id: item.id, title: item.title }]}
                  categorySource={decisionCategorySource}
                  committeeId={committeeId}
                  initialAgendaItemId={item.id}
                  initialCategory={decisionHistory.categories[0] ?? ""}
                  initialDeadline={minutes?.deadline ?? ""}
                  initialDescription={firstRichTextToPlainText(
                    minutes?.notes,
                    minutes?.decision,
                    minutes?.follow_up,
                  )}
                  initialResponsibleUserId={minutes?.responsible_user_id ?? ""}
                  initialTitle={item.title}
                  meetingDate={meetingDate}
                  meetingId={meetingId}
                  organizationId={organizationId}
                  responsiblePeople={responsiblePeople}
                  sourceLabel="punktreferatet"
                  trigger={(open) => (
                    <button
                      className="inline-flex min-h-8 items-center rounded-[var(--radius-control)] border border-brand/20 bg-surface px-2.5 py-1 text-xs font-semibold text-brand transition hover:border-brand/40 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
                      onClick={open}
                      type="button"
                    >
                      + Tilføj
                    </button>
                  )}
                />
              ) : null}
            </div>
            <div className="mt-2">
              {relatedDecisions.length > 0 ? (
                <RelatedDecisions
                  canEdit={canEditDecisions}
                  compact
                  decisions={relatedDecisions}
                  organizationId={organizationId}
                  responsiblePeople={responsiblePeople}
                />
              ) : (
                <p className="text-xs text-muted">
                  Ingen beslutninger på dette punkt
                </p>
              )}
            </div>
          </section>

          <section
            className="border-b border-line/70 p-2.5"
            aria-labelledby={`context-tasks-${occurrence.id}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h4
                className="flex items-center gap-2 text-sm font-semibold text-ink"
                id={`context-tasks-${occurrence.id}`}
              >
                <AppIcon className="text-info" name="tasks" size={16} />
                Opgaver
                <span className="text-xs font-normal text-muted">
                  {relatedTasks.length}
                </span>
              </h4>
              {canEditTasks ? (
                <TaskCreateModal
                  agendaItems={[{ id: item.id, title: item.title }]}
                  categorySource={taskCategorySource}
                  committeeId={committeeId}
                  decisions={relatedDecisions}
                  initialAgendaItemId={item.id}
                  initialDeadline={minutes?.deadline ?? ""}
                  initialDescription={firstRichTextToPlainText(
                    minutes?.follow_up,
                    minutes?.notes,
                    minutes?.decision,
                  )}
                  initialMeetingId={meetingId}
                  initialResponsibleUserId={minutes?.responsible_user_id ?? ""}
                  initialTitle={item.title}
                  instanceId={`agenda-task-context-${item.id}`}
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
                  trigger={(open) => (
                    <button
                      className="inline-flex min-h-8 items-center rounded-[var(--radius-control)] border border-brand/20 bg-surface px-2.5 py-1 text-xs font-semibold text-brand transition hover:border-brand/40 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
                      onClick={open}
                      type="button"
                    >
                      + Tilføj
                    </button>
                  )}
                />
              ) : null}
            </div>
            <div className="mt-2">
              {relatedTasks.length > 0 ? (
                <RelatedTasks
                  canEdit={canEditTasks}
                  compact
                  openInModal
                  organizationId={organizationId}
                  origins={taskOrigins}
                  relatedMeeting={{
                    id: meetingId,
                    title: meetingTitle,
                    startsAt: meetingDate,
                  }}
                  responsiblePeople={responsiblePeople}
                  tasks={relatedTasks}
                />
              ) : (
                <p className="text-xs text-muted">
                  Ingen opgaver på dette punkt
                </p>
              )}
            </div>
          </section>

          {historyMetadata && historyMetadata.historyCount >= 2 ? (
            <section className="border-b border-line/70 px-2.5 py-1">
              <AgendaItemHistoryReadMode
                agendaItemId={item.id}
                committeeId={committeeId}
                compact
                currentOccurrenceId={occurrence.id}
                metadata={historyMetadata}
                organizationId={organizationId}
              />
            </section>
          ) : null}

          {canEditPrivateNotes ? (
            <section
              className="border-b border-line/70 bg-warning-soft/55 p-2.5"
              aria-labelledby={`context-private-note-${occurrence.id}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h4
                  className="flex items-center gap-2 text-sm font-semibold text-ink"
                  id={`context-private-note-${occurrence.id}`}
                >
                  <AppIcon
                    className="text-muted"
                    name="privateNotes"
                    size={15}
                  />
                  Private noter
                </h4>
                <span className="text-[0.7rem] font-medium text-muted">
                  Kun for dig
                </span>
              </div>
              <div className="mt-2">
                <PrivateNoteEditor
                  agendaItemId={item.id}
                  committeeId={committeeId}
                  compact
                  initialPrivateNote={initialPrivateNote}
                  meetingId={meetingId}
                  organizationId={organizationId}
                  userId={userId}
                />
              </div>
              <p className="mt-1.5 text-[0.7rem] text-muted">
                Note til dette dagsordenspunkt
              </p>
              {showMeetingPrivateNote ? (
                <details className="group mt-2 border-t border-line pt-2">
                  <summary className="cursor-pointer list-none text-xs font-semibold text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                    Note for hele mødet
                  </summary>
                  <div className="mt-2">
                    <PrivateNoteEditor
                      agendaItemId={null}
                      committeeId={committeeId}
                      compact
                      initialPrivateNote={meetingPrivateNote ?? null}
                      meetingId={meetingId}
                      organizationId={organizationId}
                      userId={userId}
                    />
                  </div>
                </details>
              ) : null}
            </section>
          ) : null}

          <section
            className="p-2.5"
            aria-labelledby={`context-ai-${occurrence.id}`}
          >
            <h4
              className="flex items-center gap-2 text-sm font-semibold text-ink"
              id={`context-ai-${occurrence.id}`}
            >
              <AppIcon className="text-brand" name="ai" size={16} />
              AI
            </h4>
            <p className="mt-1 text-xs text-muted">
              Små værktøjer til det aktive punkt.
            </p>
            {canEdit || canEditTasks ? (
              <div className="mt-2 grid grid-cols-1 gap-1.5 xl:grid-cols-2 [&>div]:min-w-0 [&>div]:w-full [&_details]:w-full [&_summary]:w-full">
                {canEdit ? (
                  <MinutesAiAssistant
                    action="professional_board_style"
                    agendaItemId={item.id}
                    committeeId={committeeId}
                    field="notes"
                    meetingId={meetingId}
                    onApply={setNotes}
                    organizationId={organizationId}
                    source="agenda_item_minutes"
                    triggerLabel="Forbedr formulering"
                    value={notes}
                  />
                ) : null}
                {canEdit ? (
                  <MinutesAiAssistant
                    action="shorten"
                    agendaItemId={item.id}
                    committeeId={committeeId}
                    field="notes"
                    meetingId={meetingId}
                    onApply={setNotes}
                    organizationId={organizationId}
                    source="agenda_item_minutes"
                    triggerLabel="Opsummér punkt"
                    value={notes}
                  />
                ) : null}
                {canEditTasks ? (
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
                    compactTrigger
                    triggerLabel="Find opgaver"
                  />
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted">
                AI-handlinger er skrivebeskyttede for din rolle.
              </p>
            )}
          </section>
        </aside>
      </div>
    </article>
  );
}

function LegacyMeetingMinutesSection({
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
  documentContext,
  canApprove,
  canEdit,
  canUploadAttachments,
  canEditDecisions,
  canEditTasks,
  meetingDate,
  meetingDecisions,
  meetingTasks,
  decisionCategorySource,
  taskCategorySource,
  decisionHistoryByAgendaItem,
  approvalRecipientInfo,
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
  documentContext: MeetingDocumentContext;
  canApprove: boolean;
  canEdit: boolean;
  canUploadAttachments: boolean;
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
  approvalRecipientInfo: {
    mode: "participants" | "fallback";
    eligibleCount: number;
    fallbackMemberCount: number;
    registeredInternalCount: number;
    externalCount: number;
  };
}) {
  const [minutes, setMinutes] = useState(initialMeetingMinutes);
  const [minutesText, setMinutesText] = useState(
    initialMeetingMinutes?.minutes_text ?? "",
  );
  const [decisions, setDecisions] = useState(
    initialMeetingMinutes?.decisions ?? "",
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
      ["#general-minutes-content", "#general-minutes-heading"].includes(
        window.location.hash,
      ),
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
  const officialMinutesLockedMessage = canEditOfficialMinutes
    ? null
    : "Du skal være referent for at redigere det officielle referat";

  const meetingDraft: MeetingMinutesDraft = {
    minutesText,
    decisions,
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
    function openDeepLinkedGeneralMinutes() {
      if (
        ["#general-minutes-content", "#general-minutes-heading"].includes(
          window.location.hash,
        )
      ) {
        setIsGeneralMinutesOpen(true);
      }
    }

    openDeepLinkedGeneralMinutes();
    window.addEventListener("hashchange", openDeepLinkedGeneralMinutes);
    return () =>
      window.removeEventListener("hashchange", openDeepLinkedGeneralMinutes);
  }, []);

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
    <div className="flex flex-col gap-2.5">
      <ReferentRoleControl
        canEdit={effectiveCanEdit}
        committeeId={committeeId}
        meetingId={meetingId}
        onChange={setReferentLock}
        organizationId={organizationId}
        referentLock={referentLock}
      />
      <section
        className="order-2 scroll-mt-24 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-sm"
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
                className="block scroll-mt-24 font-semibold text-ink"
                id="general-minutes-heading"
                tabIndex={-1}
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
                lastSavedAt={meetingAutosave.lastSavedAt}
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
              relatedDocuments={documentContext.meetingDocuments}
              canEdit={canEditOfficialMinutes}
              canUpload={canUploadAttachments}
              committeeId={committeeId}
              parentMinutesId={minutes?.id ?? null}
              meetingId={meetingId}
              organizationId={organizationId}
            />
          </div>
        </div>
      </section>

      <MinutesApprovalPanel
        attachmentCount={
          meetingAttachments.length + agendaItemAttachments.length
        }
        className="order-3"
        approvalRecipientInfo={approvalRecipientInfo}
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
            <h3
              className="section-title mt-1 scroll-mt-24"
              id="agenda-minutes-heading"
              tabIndex={-1}
            >
              Referat pr. dagsordenspunkt
            </h3>
            <p className="metadata mt-1">
              {canEdit
                ? "Åbn et punkt for at læse og, når du er referent, redigere dets referat."
                : "Åbn et punkt for at læse dets referat."}
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
              canEditAgendaItem={canEdit}
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
              meetingDate={meetingDate}
              meetingDecisions={meetingDecisions}
              meetingId={meetingId}
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
              relatedDocuments={documentContext.agendaItemDocuments.filter(
                (document) =>
                  document.agendaItemId === occurrence.agenda_item_id,
              )}
              userId={userId}
              responsiblePeople={responsiblePeople}
              taskCategorySource={taskCategorySource}
              root={root}
            />
          ))}
          {occurrences.length === 0 ? (
            <EmptyState
              description={
                canEdit
                  ? "Tilføj et dagsordenspunkt fra mødehandlingerne for at starte referatet."
                  : "En mødeansvarlig kan tilføje dagsordenspunkter. De vises her, når de er planlagt."
              }
              kind={canEdit ? "empty" : "read-only"}
              title="Mødet har endnu ingen dagsordenspunkter."
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

// Kept as an internal migration reference while the historical meeting-level
// fields remain readable by exports and approval workflows.
void LegacyMeetingMinutesSection;

type MeetingMinutesSectionProps = Parameters<
  typeof LegacyMeetingMinutesSection
>[0] & {
  agendaAction?: ReactNode;
  agendaItemHistoryMetadata: AgendaItemHistoryMetadata[];
  canEditAgendaItems: boolean;
  canEditPrivateNotes: boolean;
  incomingTransfers: IncomingTransferredAgendaItemView[];
  meetingTitle: string;
  privateMeetingNote: AgendaItemPrivateNote | null;
  reviewSupplement?: ReactNode;
};

function occurrenceIdFromHash(hash: string, occurrences: AgendaOccurrence[]) {
  const match = /^#agenda-point-(.+)$/.exec(hash);
  if (match && occurrences.some((occurrence) => occurrence.id === match[1])) {
    return match[1];
  }

  return occurrences[0]?.id ?? null;
}

function agendaStatusIconName(status: AgendaMinutesStatus) {
  if (isCompletedAgendaStatus(status)) {
    return "preparation" as const;
  }

  return status === "not_started"
    ? ("pending" as const)
    : ("progress" as const);
}

function isCompletedAgendaStatus(status: AgendaMinutesStatus) {
  return [
    "completed",
    "information_oriented",
    "discussion_completed",
    "decision_approved",
    "decision_rejected",
    "follow_up_completed",
  ].includes(status);
}

function completedAgendaStatusForType(
  itemType: NonNullable<AgendaOccurrence["agenda_items"]>["item_type"],
): AgendaMinutesStatus {
  const completedStatuses = {
    information: "information_oriented",
    discussion: "discussion_completed",
    decision: "decision_approved",
    follow_up: "follow_up_completed",
  } as const satisfies Record<
    NonNullable<AgendaOccurrence["agenda_items"]>["item_type"],
    AgendaMinutesStatus
  >;
  return completedStatuses[itemType];
}

export function MeetingMinutesSection({
  agendaAction,
  agendaItemHistoryMetadata,
  organizationId,
  userId,
  committeeId,
  meetingId,
  root,
  occurrences,
  initialMeetingMinutes,
  initialAgendaItemMinutes,
  incomingTransfers,
  privateMeetingNote,
  privateAgendaItemNotes,
  referentLock: initialReferentLock,
  responsiblePeople,
  previousMeetingMinutes,
  approvals,
  meetingAttachments,
  agendaItemAttachments,
  documentContext,
  canApprove,
  canEdit,
  canUploadAttachments,
  canEditAgendaItems,
  canEditPrivateNotes,
  canEditDecisions,
  canEditTasks,
  meetingDate,
  meetingTitle,
  meetingDecisions,
  meetingTasks,
  decisionCategorySource,
  taskCategorySource,
  decisionHistoryByAgendaItem,
  approvalRecipientInfo,
  reviewSupplement,
}: MeetingMinutesSectionProps) {
  const [minutes, setMinutes] = useState(initialMeetingMinutes);
  const [meetingStatus, setMeetingStatus] = useState<MinutesStatus>(
    initialMeetingMinutes?.status ?? "draft",
  );
  const [isEditingApproved, setIsEditingApproved] = useState(false);
  const [referentLock, setReferentLock] = useState(initialReferentLock);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [agendaItemStatusOverrides, setAgendaItemStatusOverrides] = useState<
    Record<string, AgendaMinutesStatus>
  >({});
  const [reviewAgendaDrafts, setReviewAgendaDrafts] = useState<
    Record<string, AgendaMinutesDraft>
  >({});
  const [workspaceMode, setWorkspaceMode] = useState<"editing" | "review">(
    "editing",
  );
  const [headerModeSlot, setHeaderModeSlot] = useState<HTMLElement | null>(
    null,
  );
  const [activeOccurrenceId, setActiveOccurrenceId] = useState<string | null>(
    () =>
      occurrenceIdFromHash(
        typeof window === "undefined" ? "" : window.location.hash,
        occurrences,
      ),
  );
  const agendaHistoryMetadataByItemId = useMemo(
    () =>
      new Map(
        agendaItemHistoryMetadata.map((metadata) => [
          metadata.agendaItemId,
          metadata,
        ]),
      ),
    [agendaItemHistoryMetadata],
  );
  const activeOccurrenceIdRef = useRef(activeOccurrenceId);

  useEffect(() => {
    activeOccurrenceIdRef.current = activeOccurrenceId;
  }, [activeOccurrenceId]);

  useEffect(() => {
    setHeaderModeSlot(document.getElementById("meeting-header-mode-slot"));
  }, []);

  useEffect(() => {
    setReferentLock(initialReferentLock);
  }, [initialReferentLock]);

  useEffect(() => {
    setMinutes(initialMeetingMinutes);
    setMeetingStatus(initialMeetingMinutes?.status ?? "draft");
    if (initialMeetingMinutes?.status === "approved") {
      setIsEditingApproved(false);
    }
  }, [initialMeetingMinutes]);

  useEffect(() => {
    const fallbackId = occurrences[0]?.id ?? null;
    if (
      activeOccurrenceIdRef.current &&
      occurrences.some(
        (occurrence) => occurrence.id === activeOccurrenceIdRef.current,
      )
    ) {
      return;
    }
    setActiveOccurrenceId(fallbackId);
  }, [occurrences]);

  useEffect(() => {
    function syncSelectionFromHash() {
      const nextId = occurrenceIdFromHash(window.location.hash, occurrences);
      if (
        activeOccurrenceIdRef.current &&
        nextId !== activeOccurrenceIdRef.current
      ) {
        window.dispatchEvent(new Event(flushActiveAgendaDraftEvent));
      }
      activeOccurrenceIdRef.current = nextId;
      setActiveOccurrenceId(nextId);
      setSelectorOpen(false);

      if (window.location.hash.startsWith("#agenda-point-") && nextId) {
        window.requestAnimationFrame(() => {
          document
            .getElementById(`agenda-point-${nextId}-heading`)
            ?.focus({ preventScroll: true });
        });
      }
    }

    syncSelectionFromHash();
    window.addEventListener("hashchange", syncSelectionFromHash);
    return () =>
      window.removeEventListener("hashchange", syncSelectionFromHash);
  }, [occurrences]);

  const activeIndex = Math.max(
    0,
    occurrences.findIndex((occurrence) => occurrence.id === activeOccurrenceId),
  );
  const activeOccurrence = occurrences[activeIndex] ?? null;
  const activeReferentLock = isActiveReferentLock(referentLock)
    ? referentLock
    : null;
  const isCurrentReferent = Boolean(activeReferentLock?.isCurrentUser);
  const effectiveCanEdit =
    canEdit && (meetingStatus !== "approved" || isEditingApproved);
  const canEditOfficialMinutes = effectiveCanEdit && isCurrentReferent;
  const officialMinutesLockedMessage = !canEdit
    ? "Du kan læse de officielle referatfelter. En mødeansvarlig kan vælge referent og redigere."
    : activeReferentLock
      ? activeReferentLock.isCurrentUser
        ? null
        : `Referatfelter er låst, fordi ${activeReferentLock.memberName} er referent.`
      : "Tag rollen som referent for at redigere de officielle referatfelter.";

  function selectOccurrence(occurrenceId: string) {
    if (occurrenceId !== activeOccurrenceIdRef.current) {
      window.dispatchEvent(new Event(flushActiveAgendaDraftEvent));
    }
    activeOccurrenceIdRef.current = occurrenceId;
    setActiveOccurrenceId(occurrenceId);
    setSelectorOpen(false);
    if (window.location.hash === `#agenda-point-${occurrenceId}`) {
      window.requestAnimationFrame(() => {
        document
          .getElementById(`agenda-point-${occurrenceId}-heading`)
          ?.focus({ preventScroll: true });
      });
    }
  }

  const handleAgendaDraftChange = useCallback(
    (agendaItemId: string, draft: AgendaMinutesDraft) => {
      setReviewAgendaDrafts((current) => {
        const previous = current[agendaItemId];
        if (
          previous &&
          previous.notes === draft.notes &&
          previous.decision === draft.decision &&
          previous.followUp === draft.followUp &&
          previous.responsibleUserId === draft.responsibleUserId &&
          previous.deadline === draft.deadline &&
          previous.status === draft.status
        ) {
          return current;
        }
        return { ...current, [agendaItemId]: draft };
      });
    },
    [],
  );

  function openReviewMode() {
    window.dispatchEvent(new Event(flushActiveAgendaDraftEvent));
    setWorkspaceMode("review");
  }

  function renderAgendaChoice(
    occurrence: AgendaOccurrence,
    index: number,
    mobile = false,
  ) {
    const item = occurrence.agenda_items;
    if (!item) return null;
    const itemMinutes = initialAgendaItemMinutes.find(
      (candidate) => candidate.agenda_item_id === occurrence.agenda_item_id,
    );
    const itemStatus = normalizeAgendaItemMinutesStatus(
      item.item_type,
      agendaItemStatusOverrides[occurrence.agenda_item_id] ??
        itemMinutes?.status ??
        "not_started",
    );
    const isActive = occurrence.id === activeOccurrence?.id;
    const isCompleted = isCompletedAgendaStatus(itemStatus);

    return (
      <Link
        aria-current={isActive ? "location" : undefined}
        className={clsx(
          "group block border-l-[3px] px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
          isActive
            ? "border-brand bg-brand-soft/70 text-brand"
            : "border-transparent text-muted hover:border-brand/35 hover:bg-subtle hover:text-ink",
          mobile &&
            "min-h-14 rounded-[var(--radius-control)] border-y border-r border-line",
        )}
        href={`#agenda-point-${occurrence.id}`}
        key={occurrence.id}
        onClick={() => selectOccurrence(occurrence.id)}
      >
        <span className="flex items-start gap-2">
          <AppIcon
            className={clsx(
              "mt-0.5 shrink-0",
              isCompleted
                ? "text-success"
                : isActive
                  ? "text-brand"
                  : "text-muted",
            )}
            name={agendaStatusIconName(itemStatus)}
            size={isCompleted ? 16 : 15}
          />
          <span className="min-w-0">
            <span className="flex items-baseline gap-1.5">
              <span className="shrink-0 text-xs font-bold text-muted">
                {index + 1}.
              </span>
              <span className="rounded bg-subtle/50 px-1 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-muted/70">
                {agendaItemTypeLabels[item.item_type].short}
              </span>
            </span>
            <span
              className={clsx(
                "mt-0.5 block break-words text-sm font-semibold leading-[1.1rem]",
                isActive ? "text-ink" : "text-ink/70",
              )}
            >
              {item.title}
            </span>
            <span
              className={clsx(
                "mt-0.5 block text-[0.7rem] leading-4",
                isCompleted ? "text-success" : "text-muted",
              )}
            >
              {agendaItemMinutesStatusLabels[itemStatus]}
            </span>
          </span>
        </span>
      </Link>
    );
  }

  function renderModeSwitch() {
    return (
      <div
        aria-label="Referatvisning"
        className="inline-flex shrink-0 rounded-[var(--radius-control)] bg-subtle p-0.5"
        role="group"
      >
        <button
          aria-pressed={workspaceMode === "editing"}
          className={clsx(
            "rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
            workspaceMode === "editing"
              ? "bg-brand text-white shadow-sm"
              : "text-muted hover:bg-surface hover:text-ink",
          )}
          onClick={() => setWorkspaceMode("editing")}
          type="button"
        >
          Redigering
        </button>
        <button
          aria-pressed={workspaceMode === "review"}
          className={clsx(
            "rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
            workspaceMode === "review"
              ? "bg-brand text-white shadow-sm"
              : "text-muted hover:bg-surface hover:text-ink",
          )}
          onClick={openReviewMode}
          type="button"
        >
          Læsning/godkendelse
        </button>
      </div>
    );
  }

  function renderReviewStatus() {
    if (workspaceMode !== "review") return null;
    const pendingCount = approvals.filter(
      (approval) => approval.status === "pending",
    ).length;
    const label =
      meetingStatus === "approved"
        ? "Godkendt"
        : meetingStatus === "ready_for_approval"
          ? pendingCount > 0
            ? `Afventer ${pendingCount}`
            : "Afventer godkendelse"
          : "Kladde";

    return (
      <StatusBadge
        tone={
          meetingStatus === "approved"
            ? "success"
            : meetingStatus === "ready_for_approval"
              ? "warning"
              : "neutral"
        }
      >
        {label}
      </StatusBadge>
    );
  }

  function renderApprovedEditAction() {
    return canEdit &&
      meetingStatus === "approved" &&
      workspaceMode === "editing" ? (
      <button
        className="rounded-[var(--radius-control)] px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        onClick={() => setIsEditingApproved((current) => !current)}
        type="button"
      >
        {isEditingApproved ? "Stop redigering" : "Rediger godkendt"}
      </button>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="sr-only" id="general-minutes-heading" tabIndex={-1}>
        Dagsordenspunkter
      </span>
      <span className="sr-only" id="general-minutes-content" tabIndex={-1}>
        Dagsordenspunkter
      </span>

      {headerModeSlot
        ? createPortal(
            <div className="hidden min-w-0 flex-wrap items-center gap-1.5 xl:flex">
              {renderModeSwitch()}
              {renderReviewStatus()}
              {renderApprovedEditAction()}
            </div>,
            headerModeSlot,
          )
        : null}

      <div className="flex flex-wrap items-center justify-end gap-2 xl:hidden">
        {renderModeSwitch()}
        {renderReviewStatus()}
        {renderApprovedEditAction()}
      </div>

      {workspaceMode === "editing" ? (
        <>
          <section
            aria-labelledby="agenda-minutes-heading"
            className="relative pb-4 xl:pb-5"
          >
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 xl:absolute xl:bottom-5 xl:left-0 xl:z-10 xl:mb-0 xl:w-[18%] xl:border-t xl:border-line/70 xl:bg-surface xl:p-2">
              <h2
                className="scroll-mt-24 text-sm font-semibold text-ink xl:hidden"
                id="agenda-minutes-heading"
                tabIndex={-1}
              >
                Dagsorden
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted xl:hidden">
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
                {agendaAction}
              </div>
            </div>

            {activeOccurrence?.agenda_items ? (
              <>
                <div className="mb-3 rounded-[var(--radius-panel)] border border-brand/25 bg-brand-soft/45 p-3 xl:hidden">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                    Punkt {activeIndex + 1} af {occurrences.length}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">
                    {
                      agendaItemTypeLabels[
                        activeOccurrence.agenda_items.item_type
                      ].label
                    }
                  </p>
                  <p className="mt-1 break-words text-base font-semibold text-ink">
                    {activeOccurrence.agenda_items.title}
                  </p>
                  <Button
                    className="mt-3 w-full"
                    onClick={() => setSelectorOpen(true)}
                    type="button"
                    variant="secondary"
                  >
                    Vælg et andet punkt
                  </Button>
                </div>

                <div className="grid min-w-0 gap-2 xl:grid-cols-[minmax(12rem,18fr)_minmax(0,82fr)] xl:items-start xl:gap-0 xl:overflow-hidden xl:rounded-[var(--radius-panel)] xl:border xl:border-line/70 xl:bg-surface">
                  <nav
                    aria-label="Dagsordenspunkter"
                    className="workspace-scrollbar sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain bg-surface pb-14 xl:block xl:border-r xl:border-line/70"
                  >
                    <div className="flex items-center justify-between border-b border-line/70 px-2.5 py-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Dagsorden
                      </span>
                      <span className="text-[0.7rem] text-muted">
                        {occurrences.length}
                      </span>
                    </div>
                    <div className="space-y-0.5 p-1">
                      {occurrences.map((occurrence, index) =>
                        renderAgendaChoice(occurrence, index),
                      )}
                    </div>
                  </nav>

                  <div className="min-w-0">
                    {occurrences.map((occurrence, index) => (
                      <div
                        aria-hidden={occurrence.id !== activeOccurrence.id}
                        hidden={occurrence.id !== activeOccurrence.id}
                        key={occurrence.id}
                      >
                        <AgendaMinutesCard
                          attachments={agendaItemAttachments.filter(
                            (attachment) =>
                              attachment.agendaItemId ===
                              occurrence.agenda_item_id,
                          )}
                          relatedDocuments={documentContext.agendaItemDocuments.filter(
                            (document) =>
                              document.agendaItemId === occurrence.agenda_item_id,
                          )}
                          canEdit={canEditOfficialMinutes}
                          canUploadAttachment={canUploadAttachments}
                          canEditAgendaItem={canEditAgendaItems}
                          canEditPrivateNotes={canEditPrivateNotes}
                          canEditDecisions={canEditDecisions}
                          canEditTasks={canEditTasks}
                          committeeId={committeeId}
                          decisionCategorySource={decisionCategorySource}
                          decisionHistory={
                            decisionHistoryByAgendaItem[
                              occurrence.agenda_item_id
                            ] ?? { categories: [], decisions: [] }
                          }
                          displayNumber={index + 1}
                          editorLockAction={
                            occurrence.id === activeOccurrence.id ? (
                              <ReferentRoleControl
                                canEdit={effectiveCanEdit}
                                committeeId={committeeId}
                                meetingId={meetingId}
                                onChange={setReferentLock}
                                organizationId={organizationId}
                                referentLock={referentLock}
                              />
                            ) : null
                          }
                          editorLockedMessage={officialMinutesLockedMessage}
                          initialMinutes={
                            initialAgendaItemMinutes.find(
                              (candidate) =>
                                candidate.agenda_item_id ===
                                occurrence.agenda_item_id,
                            ) ?? null
                          }
                          initialPrivateNote={
                            privateAgendaItemNotes.find(
                              (candidate) =>
                                candidate.agenda_item_id ===
                                occurrence.agenda_item_id,
                            ) ?? null
                          }
                          incomingTransfers={incomingTransfers}
                          isActive={occurrence.id === activeOccurrence.id}
                          historyMetadata={
                            agendaHistoryMetadataByItemId.get(
                              occurrence.agenda_item_id,
                            ) ?? null
                          }
                          meetingDate={meetingDate}
                          meetingDecisions={meetingDecisions}
                          meetingId={meetingId}
                          meetingPrivateNote={privateMeetingNote}
                          meetingTitle={meetingTitle}
                          meetingTasks={meetingTasks}
                          minutesStatus={meetingStatus}
                          occurrence={occurrence}
                          organizationId={organizationId}
                          onDraftChange={handleAgendaDraftChange}
                          onStatusChange={(agendaItemId, nextStatus) =>
                            setAgendaItemStatusOverrides((current) => ({
                              ...current,
                              [agendaItemId]: nextStatus,
                            }))
                          }
                          previousMeetingMinutes={previousMeetingMinutes}
                          responsiblePeople={responsiblePeople}
                          root={root}
                          showMeetingPrivateNote={
                            occurrence.id === activeOccurrence.id
                          }
                          taskCategorySource={taskCategorySource}
                          userId={userId}
                        />
                      </div>
                    ))}

                    <nav
                      aria-label="Forrige og næste dagsordenspunkt"
                      className="mt-1 grid grid-cols-2 gap-2 pb-1 xl:grid-cols-[minmax(0,27fr)_minmax(16rem,14fr)]"
                    >
                      <div className="col-span-2 grid grid-cols-2 gap-2 xl:col-span-1">
                        {activeIndex > 0 ? (
                          <Link
                            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-brand/35 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
                            href={`#agenda-point-${occurrences[activeIndex - 1].id}`}
                            onClick={() =>
                              selectOccurrence(occurrences[activeIndex - 1].id)
                            }
                          >
                            <AppIcon name="arrowLeft" size={15} />
                            Forrige punkt
                          </Link>
                        ) : (
                          <button
                            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-subtle/40 px-3 py-1.5 text-xs font-semibold text-muted opacity-55"
                            disabled
                            type="button"
                          >
                            <AppIcon name="arrowLeft" size={15} />
                            Forrige punkt
                          </button>
                        )}
                        {activeIndex < occurrences.length - 1 ? (
                          <Link
                            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-brand bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                            href={`#agenda-point-${occurrences[activeIndex + 1].id}`}
                            onClick={() =>
                              selectOccurrence(occurrences[activeIndex + 1].id)
                            }
                          >
                            Næste punkt
                            <AppIcon name="arrowRight" size={15} />
                          </Link>
                        ) : (
                          <button
                            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-subtle/40 px-3 py-1.5 text-xs font-semibold text-muted opacity-55"
                            disabled
                            type="button"
                          >
                            Næste punkt
                            <AppIcon name="arrowRight" size={15} />
                          </button>
                        )}
                      </div>
                    </nav>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                description={
                  canEdit
                    ? "Tilføj et dagsordenspunkt fra mødehandlingerne for at starte referatet."
                    : "En mødeansvarlig kan tilføje dagsordenspunkter. De vises her, når de er planlagt."
                }
                kind={canEdit ? "empty" : "read-only"}
                title="Mødet har endnu ingen dagsordenspunkter."
              />
            )}
          </section>

          <Modal
            description="Vælg det punkt, der skal vises i mødearbejdsfladen."
            onClose={() => setSelectorOpen(false)}
            open={selectorOpen}
            title="Vælg dagsordenspunkt"
          >
            <nav aria-label="Vælg dagsordenspunkt" className="space-y-2">
              {occurrences.map((occurrence, index) =>
                renderAgendaChoice(occurrence, index, true),
              )}
            </nav>
          </Modal>
        </>
      ) : (
        <section aria-labelledby="minutes-review-heading">
          <details className="group mb-3 rounded-[var(--radius-control)] border border-line bg-surface xl:hidden">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              Dagsorden · {occurrences.length} punkter
              <AppIcon
                className="text-muted transition group-open:rotate-180"
                name="chevronDown"
                size={14}
              />
            </summary>
            <nav
              aria-label="Dagsordenspunkter i referatet"
              className="space-y-0.5 border-t border-line p-1"
            >
              {occurrences.map((occurrence, index) =>
                renderAgendaChoice(occurrence, index),
              )}
            </nav>
          </details>

          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(12rem,20fr)_minmax(0,61fr)_minmax(14rem,19fr)] xl:items-start">
            <nav
              aria-label="Dagsordenspunkter i referatet"
              className="workspace-scrollbar sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto rounded-[var(--radius-panel)] border border-line bg-surface xl:block"
            >
              <div className="flex items-center justify-between border-b border-line/70 px-2.5 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Dagsorden
                </span>
                <span className="text-[0.7rem] text-muted">
                  {occurrences.length}
                </span>
              </div>
              <div className="space-y-0.5 p-1">
                {occurrences.map((occurrence, index) =>
                  renderAgendaChoice(occurrence, index),
                )}
              </div>
            </nav>

            <article className="minutes-document min-w-0 rounded-[var(--radius-panel)] border border-line/70 bg-surface px-4 py-4 shadow-sm sm:px-6 sm:py-5">
              <header className="border-b border-line pb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                  Mødereferat
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2
                    className="break-words text-xl font-bold leading-7 text-ink sm:text-2xl"
                    id="minutes-review-heading"
                  >
                    {meetingTitle}
                  </h2>
                  <StatusBadge tone={meetingStatusTones[meetingStatus]}>
                    {meetingMinutesStatusLabels[meetingStatus]}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {formatDateTime(meetingDate, "full")} · {occurrences.length}{" "}
                  {occurrences.length === 1
                    ? "dagsordenspunkt"
                    : "dagsordenspunkter"}
                </p>
                {meetingAttachments.length + documentContext.meetingDocuments.length > 0 ? (
                  <details className="group mt-2 text-sm">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-semibold text-brand hover:underline [&::-webkit-details-marker]:hidden">
                      <AppIcon name="attachments" size={14} />
                      Mødebilag ({meetingAttachments.length + documentContext.meetingDocuments.length})
                    </summary>
                    <div className="mt-2 border-l-2 border-line pl-3">
                      <MinuteAttachments
                        attachments={meetingAttachments}
                        relatedDocuments={documentContext.meetingDocuments}
                        canEdit={false}
                        committeeId={committeeId}
                        meetingId={meetingId}
                        organizationId={organizationId}
                      />
                    </div>
                  </details>
                ) : null}
              </header>

              {occurrences.length > 0 ? (
                <div className="divide-y divide-line/80">
                  {occurrences.map((occurrence, index) => {
                    const item = occurrence.agenda_items;
                    if (!item) return null;
                    const itemMinutes = initialAgendaItemMinutes.find(
                      (candidate) =>
                        candidate.agenda_item_id === occurrence.agenda_item_id,
                    );
                    const itemStatus = normalizeAgendaItemMinutesStatus(
                      item.item_type,
                      agendaItemStatusOverrides[occurrence.agenda_item_id] ??
                        reviewAgendaDrafts[occurrence.agenda_item_id]?.status ??
                        itemMinutes?.status ??
                        "not_started",
                    );
                    const reviewDraft =
                      reviewAgendaDrafts[occurrence.agenda_item_id];
                    const reviewNotes =
                      reviewDraft?.notes ?? itemMinutes?.notes ?? "";
                    const reviewDecision =
                      reviewDraft?.decision ?? itemMinutes?.decision ?? "";
                    const reviewFollowUp =
                      reviewDraft?.followUp ?? itemMinutes?.follow_up ?? "";
                    const relatedDecisions = meetingDecisions.filter(
                      (decision) => decision.agenda_item_id === item.id,
                    );
                    const incomingTransfer = incomingTransfers.find(
                      (transfer) => transfer.targetAgendaItemId === item.id,
                    );
                    const relatedTasks = mergeTransferredTaskReferences(
                      meetingTasks.filter(
                        (task) => task.agenda_item_id === item.id,
                      ),
                      incomingTransfer?.sourceTasks ?? [],
                    );
                    const hasNotes = Boolean(
                      firstRichTextToPlainText(reviewNotes).trim(),
                    );
                    const hasDecisionNote = Boolean(
                      firstRichTextToPlainText(reviewDecision).trim(),
                    );
                    const hasFollowUp = Boolean(
                      firstRichTextToPlainText(reviewFollowUp).trim(),
                    );
                    const agendaContext = item.description || item.objective;
                    const hasDistinctAgendaContext = Boolean(
                      normalizeReadModeContent(agendaContext) &&
                      normalizeReadModeContent(agendaContext) !==
                        normalizeReadModeContent(reviewNotes),
                    );

                    return (
                      <section
                        className="scroll-mt-24 py-5 first:pt-4 last:pb-1"
                        id={`agenda-point-${occurrence.id}`}
                        key={occurrence.id}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 shrink-0 text-sm font-bold text-muted">
                            {index + 1}.
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3
                              className="break-words text-lg font-bold leading-6 text-ink"
                              id={`agenda-point-${occurrence.id}-heading`}
                              tabIndex={-1}
                            >
                              {item.title}
                            </h3>
                            <p className="mt-1 text-xs text-muted">
                              {agendaItemTypeLabels[item.item_type].label} ·{" "}
                              {agendaItemMinutesStatusLabels[itemStatus]}
                            </p>
                          </div>
                        </div>

                        <div className="ml-0 mt-4 max-w-[52rem] sm:ml-7">
                          {hasDistinctAgendaContext ? (
                            <section className="mb-4">
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                                {item.description ? "Baggrund" : "Formål"}
                              </h4>
                              <RichTextContent
                                className="mt-1.5 text-sm leading-6 text-muted"
                                value={agendaContext}
                              />
                            </section>
                          ) : null}
                          <section>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                              Referat
                            </h4>
                            <RichTextContent
                              className="mt-1.5 text-[0.95rem] leading-7 text-ink"
                              emptyText="Intet referat registreret."
                              value={hasNotes ? reviewNotes : null}
                            />
                          </section>

                          {hasDecisionNote ? (
                            <section className="mt-4 border-l-2 border-brand/25 pl-3">
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                                Beslutningsnotat
                              </h4>
                              <RichTextContent
                                className="mt-1 text-[0.95rem] leading-7 text-ink"
                                value={reviewDecision}
                              />
                            </section>
                          ) : null}

                          {hasFollowUp ? (
                            <section className="mt-4">
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                                Opfølgning
                              </h4>
                              <RichTextContent
                                className="mt-1 text-[0.95rem] leading-7 text-ink"
                                value={reviewFollowUp}
                              />
                            </section>
                          ) : null}

                          {relatedDecisions.length > 0 ? (
                            <section className="mt-4">
                              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                                Beslutninger
                              </h4>
                              <RelatedDecisions
                                compact
                                decisions={relatedDecisions}
                                organizationId={organizationId}
                              />
                            </section>
                          ) : null}

                          {relatedTasks.length > 0 ? (
                            <section className="mt-4">
                              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                                Opgaver
                              </h4>
                              <RelatedTasks
                                canEdit={false}
                                compact
                                openInModal
                                organizationId={organizationId}
                                relatedMeeting={{
                                  id: meetingId,
                                  title: meetingTitle,
                                  startsAt: meetingDate,
                                }}
                                responsiblePeople={responsiblePeople}
                                tasks={relatedTasks}
                              />
                            </section>
                          ) : null}

                          <AgendaItemHistoryReadMode
                            agendaItemId={item.id}
                            committeeId={committeeId}
                            currentOccurrenceId={occurrence.id}
                            metadata={
                              agendaHistoryMetadataByItemId.get(item.id) ?? null
                            }
                            organizationId={organizationId}
                          />
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <p className="py-8 text-sm text-muted">
                  Mødet har ingen dagsordenspunkter.
                </p>
              )}
            </article>

            <aside className="xl:sticky xl:top-20">
              <MinutesApprovalPanel
                attachmentCount={
                  meetingAttachments.length + agendaItemAttachments.length
                  + documentContext.meetingDocuments.length
                  + documentContext.agendaItemDocuments.length
                }
                approvalRecipientInfo={approvalRecipientInfo}
                approvals={approvals}
                canApprove={canApprove}
                canEdit={canEdit}
                className="min-w-0"
                committeeId={committeeId}
                compact
                meetingId={meetingId}
                minutes={minutes ?? initialMeetingMinutes}
                organizationId={organizationId}
                userId={userId}
              />
            </aside>
          </div>
          {reviewSupplement ? (
            <div className="mt-5 border-t border-line pt-1">
              {reviewSupplement}
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
