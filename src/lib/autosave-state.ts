export type AutosaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "error"
  | "offline"
  | "pending"
  | "conflict";

const unsynchronizedStatuses = new Set<AutosaveStatus>([
  "saving",
  "error",
  "offline",
  "pending",
  "conflict",
]);

export function hasUnsynchronizedAutosaveChanges({
  enabled,
  currentSerialized,
  lastSavedSerialized,
  status,
  hasConflict,
}: {
  enabled: boolean;
  currentSerialized: string;
  lastSavedSerialized: string;
  status: AutosaveStatus;
  hasConflict: boolean;
}) {
  return (
    enabled &&
    (currentSerialized !== lastSavedSerialized ||
      hasConflict ||
      unsynchronizedStatuses.has(status))
  );
}
