"use client";

import { AppIcon } from "@/components/icons/app-icon";
import type {
  AutosaveStatus,
  StoredLocalDraft,
} from "@/hooks/use-offline-autosave";

const statusLabels: Record<AutosaveStatus, string> = {
  idle: "",
  saving: "Gemmer…",
  saved: "Autogemt",
  error: "Kunne ikke gemme",
  offline: "Offline – gemmes lokalt",
  pending: "Afventer synkronisering",
  conflict: "Konflikt kræver handling",
};

export function AutosaveStatusLine({
  status,
  errorMessage,
  onRetry,
  lastSavedAt,
  savedLabel = "Autogemt",
}: {
  status: AutosaveStatus;
  errorMessage: string | null;
  onRetry: () => void;
  lastSavedAt?: Date | null;
  savedLabel?: string;
}) {
  if (status === "idle") return null;
  const isError = status === "error" || status === "conflict";
  const isWarning = status === "offline" || status === "pending";
  const savedAtLabel =
    status === "saved" && lastSavedAt
      ? ` kl. ${lastSavedAt
          .toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })
          .replace(":", ".")}`
      : "";

  return (
    <div
      aria-live="polite"
      className={`flex min-w-0 flex-wrap items-center gap-1.5 text-xs ${
        isError
          ? "text-danger"
          : isWarning
            ? "text-warning"
            : status === "saved"
              ? "text-success"
              : "text-muted"
      }`}
      role={isError ? "alert" : "status"}
    >
      {status === "saved" ? (
        <AppIcon aria-hidden="true" name="preparation" size={14} />
      ) : null}
      <span>
        {status === "saved" ? savedLabel : statusLabels[status]}
        {savedAtLabel}
      </span>
      {isError && errorMessage ? <span>({errorMessage})</span> : null}
      {isError || status === "pending" ? (
        <button
          className="font-semibold underline underline-offset-2"
          onClick={onRetry}
          type="button"
        >
          Prøv igen
        </button>
      ) : null}
    </div>
  );
}

export function LocalDraftConflict<T>({
  draft,
  onRestore,
  onKeepServer,
}: {
  draft: StoredLocalDraft<T> | null;
  onRestore: () => void;
  onKeepServer: () => void;
}) {
  if (!draft) return null;

  return (
    <div
      className="rounded-[var(--radius-control)] border border-warning/25 bg-warning-soft px-3 py-2 text-sm text-ink"
      role="alert"
    >
      <p className="font-semibold">
        Der findes lokale ændringer, som ikke er synkroniseret.
      </p>
      <p className="mt-0.5 text-xs text-muted">
        Vælg hvilken version du vil fortsætte med. Den lokale kladde slettes
        ikke, før du vælger serverversionen eller synkroniseringen lykkes.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="button-primary" onClick={onRestore} type="button">
          Gendan lokal kladde
        </button>
        <button
          className="button-secondary"
          onClick={onKeepServer}
          type="button"
        >
          Behold serverversion
        </button>
      </div>
    </div>
  );
}
