"use client";

import type {
  AutosaveStatus,
  StoredLocalDraft,
} from "@/hooks/use-offline-autosave";

const statusLabels: Record<AutosaveStatus, string> = {
  idle: "",
  saving: "Gemmer...",
  saved: "Gemt på serveren",
  error: "Fejl ved gemning",
  offline: "Kun gemt lokalt - du er offline",
  pending: "Kun gemt lokalt - afventer synkronisering",
  conflict: "Konflikt - din lokale kladde er ikke overskrevet",
};

export function AutosaveStatusLine({
  status,
  errorMessage,
  onRetry,
}: {
  status: AutosaveStatus;
  errorMessage: string | null;
  onRetry: () => void;
}) {
  if (status === "idle") return null;
  const isError = status === "error" || status === "conflict";
  const isWarning = status === "offline" || status === "pending";

  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-xs ${
        isError
          ? "text-red-700"
          : isWarning
            ? "text-amber-700"
            : "text-slate-500"
      }`}
      role={isError ? "alert" : "status"}
    >
      <span>{statusLabels[status]}</span>
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
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      role="alert"
    >
      <p className="font-semibold">
        Der findes lokale ændringer, som ikke er synkroniseret.
      </p>
      <p className="mt-1 text-xs text-amber-800">
        Vælg hvilken version du vil fortsætte med. Den lokale kladde slettes
        ikke, før du vælger serverversionen eller synkroniseringen lykkes.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
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
