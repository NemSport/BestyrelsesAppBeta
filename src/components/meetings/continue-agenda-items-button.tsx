"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";

export function ContinueAgendaItemsButton({
  meetingId,
}: {
  meetingId: string;
}) {
  const router = useRouter();
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function importItems() {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/meetings/${meetingId}/continue-agenda-items`,
        {
          method: "POST",
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Punkterne kunne ikke hentes.");
      setMessage(
        result.count > 0
          ? `${result.count} punkt${result.count === 1 ? "" : "er"} er føjet til dagsordenen.`
          : "Ingen afventende punkter har dette møde som næste møde.",
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Punkterne kunne ikke hentes.",
      );
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  return (
    <div className="mb-4 space-y-2">
      <Button
        disabled={pending}
        onClick={importItems}
        type="button"
        variant="secondary"
      >
        {pending ? "Henter punkter..." : "Hent punkter fra forrige møde"}
      </Button>
      <p className="text-sm text-muted">
        Hent afventende punkter med status “Fortsættes næste møde”.
      </p>
      {message ? (
        <p className="text-sm" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
