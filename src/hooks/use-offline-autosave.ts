"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "error"
  | "offline"
  | "pending";

export type StoredLocalDraft<T> = {
  version: 1;
  data: T;
  updatedAt: string;
  serverUpdatedAt: string | null;
};

function serialize(value: unknown) {
  return JSON.stringify(value);
}

export function useOfflineAutosave<T, TResult>({
  storageKey,
  data,
  serverUpdatedAt,
  enabled,
  save,
  restore,
  onSaved,
  onError,
  debounceMs = 1400,
}: {
  storageKey: string;
  data: T;
  serverUpdatedAt: string | null;
  enabled: boolean;
  save: (data: T) => Promise<TResult>;
  restore: (data: T) => void;
  onSaved?: (result: TResult) => void;
  onError?: (error: unknown) => void;
  debounceMs?: number;
}) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [conflict, setConflict] = useState<StoredLocalDraft<T> | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const dataRef = useRef(data);
  const saveRef = useRef(save);
  const restoreRef = useRef(restore);
  const onSavedRef = useRef(onSaved);
  const onErrorRef = useRef(onError);
  const lastSavedSerializedRef = useRef(serialize(data));
  const lastObservedSerializedRef = useRef(serialize(data));
  const changeVersionRef = useRef(0);
  const savingRef = useRef(false);
  const saveAgainRef = useRef(false);
  const conflictRef = useRef<StoredLocalDraft<T> | null>(null);

  const observedSerialized = serialize(data);
  if (observedSerialized !== lastObservedSerializedRef.current) {
    lastObservedSerializedRef.current = observedSerialized;
    changeVersionRef.current += 1;
  }
  dataRef.current = data;
  saveRef.current = save;
  restoreRef.current = restore;
  onSavedRef.current = onSaved;
  onErrorRef.current = onError;
  conflictRef.current = conflict;

  const storeDraft = useCallback(
    (draftData: T) => {
      const draft: StoredLocalDraft<T> = {
        version: 1,
        data: draftData,
        updatedAt: new Date().toISOString(),
        serverUpdatedAt,
      };
      localStorage.setItem(storageKey, JSON.stringify(draft));
      return draft;
    },
    [serverUpdatedAt, storageKey],
  );

  const saveNow = useCallback(
    async (override?: T) => {
      if (!enabled || conflictRef.current) return null;
      const payload = override ?? dataRef.current;
      storeDraft(payload);

      if (savingRef.current) {
        saveAgainRef.current = true;
        setStatus("pending");
        return null;
      }

      if (!navigator.onLine) {
        setStatus("offline");
        return null;
      }

      savingRef.current = true;
      const requestVersion = changeVersionRef.current;
      setStatus("saving");
      setErrorMessage(null);
      try {
        const result = await saveRef.current(payload);
        const savedSerialized = serialize(payload);
        lastSavedSerializedRef.current = savedSerialized;
        setLastSavedAt(new Date());
        onSavedRef.current?.(result);
        if (
          changeVersionRef.current === requestVersion &&
          !saveAgainRef.current
        ) {
          localStorage.removeItem(storageKey);
          setStatus("saved");
        } else {
          storeDraft(dataRef.current);
          setStatus(navigator.onLine ? "pending" : "offline");
          saveAgainRef.current = true;
        }
        return result;
      } catch (error) {
        onErrorRef.current?.(error);
        setErrorMessage(
          error instanceof Error ? error.message : "Kunne ikke gemme",
        );
        setStatus("error");
        return null;
      } finally {
        savingRef.current = false;
        if (saveAgainRef.current && navigator.onLine) {
          saveAgainRef.current = false;
          window.setTimeout(() => {
            void saveNow(dataRef.current);
          }, 0);
        }
      }
    },
    [enabled, storageKey, storeDraft],
  );

  useEffect(() => {
    if (!enabled) return;
    const rawDraft = localStorage.getItem(storageKey);
    if (rawDraft) {
      try {
        const draft = JSON.parse(rawDraft) as StoredLocalDraft<T>;
        if (draft.version !== 1) {
          localStorage.removeItem(storageKey);
        } else if (serialize(draft.data) !== serialize(dataRef.current)) {
          setConflict(draft);
          setStatus("pending");
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
    lastSavedSerializedRef.current = serialize(dataRef.current);
    initializedRef.current = true;
  }, [enabled, serverUpdatedAt, storageKey]);

  useEffect(() => {
    if (!enabled || !initializedRef.current || conflict) return;
    const serialized = serialize(data);
    if (serialized === lastSavedSerializedRef.current) return;

    storeDraft(data);
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }

    setStatus("pending");
    const timeout = window.setTimeout(() => {
      void saveNow();
    }, debounceMs);
    return () => window.clearTimeout(timeout);
  }, [conflict, data, debounceMs, enabled, saveNow, storeDraft]);

  useEffect(() => {
    if (!enabled) return;

    function handleOffline() {
      if (localStorage.getItem(storageKey)) setStatus("offline");
    }

    function handleOnline() {
      if (conflictRef.current) {
        setStatus("pending");
        return;
      }
      if (localStorage.getItem(storageKey)) {
        setStatus("pending");
        void saveNow();
      }
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [enabled, saveNow, storageKey]);

  function restoreLocalDraft() {
    if (!conflict) return;
    restoreRef.current(conflict.data);
    setConflict(null);
    setStatus(navigator.onLine ? "pending" : "offline");
  }

  function keepServerVersion() {
    localStorage.removeItem(storageKey);
    lastSavedSerializedRef.current = serialize(dataRef.current);
    setConflict(null);
    setStatus("idle");
    setErrorMessage(null);
  }

  return {
    status,
    conflict,
    lastSavedAt,
    errorMessage,
    saveNow,
    retry: saveNow,
    restoreLocalDraft,
    keepServerVersion,
  };
}
