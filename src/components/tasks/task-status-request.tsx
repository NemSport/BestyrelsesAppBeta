"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui";

export function TaskStatusRequest({
  organizationId,
  taskId,
}: {
  organizationId: string;
  taskId: string;
}) {
  const requestId = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function send() {
    if (pending) return;
    requestId.current ??= crypto.randomUUID();
    setPending(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/tasks/${taskId}/status-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, requestId: requestId.current }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(result.message);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Statusrykkeren kunne ikke sendes.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        disabled={pending || !!message}
        onClick={() => void send()}
      >
        {pending ? "Sender …" : "Bed om status"}
      </Button>
      {message ? (
        <p className="text-sm text-muted" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
