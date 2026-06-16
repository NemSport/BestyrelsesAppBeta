"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, type ButtonVariant } from "@/components/ui";

async function readResponse(response: Response) {
  const result = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(result.error || "Handlingen kunne ikke gennemføres.");
  }
  return result;
}

export function TrashActionButton({
  endpoint,
  label,
  pendingLabel,
  confirmMessage,
  redirectTo,
  variant = "danger",
  size = "sm",
  onSuccessMessage,
}: {
  endpoint: string;
  label: string;
  pendingLabel?: string;
  confirmMessage: string;
  redirectTo?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  onSuccessMessage?: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction() {
    if (!window.confirm(confirmMessage)) return;
    setIsPending(true);
    setError(null);
    setMessage(null);

    try {
      const result = await readResponse(
        await fetch(endpoint, { method: "DELETE" }),
      );
      setMessage(onSuccessMessage || result.message || "Handlingen er udført.");
      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Handlingen kunne ikke gennemføres.",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        disabled={isPending}
        onClick={() => void runAction()}
        size={size}
        variant={variant}
      >
        {isPending ? pendingLabel || "Flytter..." : label}
      </Button>
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
      {message && !redirectTo ? (
        <p className="text-xs font-medium text-success">{message}</p>
      ) : null}
    </div>
  );
}
