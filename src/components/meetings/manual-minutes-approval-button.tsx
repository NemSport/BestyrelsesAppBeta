"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";

export function ManualMinutesApprovalButton({
  organizationId,
  committeeId,
  meetingId,
  approvalId,
  memberName,
}: {
  organizationId: string;
  committeeId: string;
  meetingId: string;
  approvalId: string;
  memberName: string;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function record() {
    if (
      working ||
      !window.confirm(
        `Registrér en manuel godkendelse på vegne af ${memberName}?`,
      )
    )
      return;

    setWorking(true);
    setError("");
    try {
      const response = await fetch(
        `/api/meetings/${meetingId}/minutes/approval`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "record_manual_approval",
            organizationId,
            committeeId,
            approvalId,
          }),
        },
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Godkendelsen kunne ikke gemmes.");
      }
      router.refresh();
    } catch (caught) {
      setWorking(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "Godkendelsen kunne ikke gemmes.",
      );
    }
  }

  return (
    <div>
      <Button
        aria-label={`Godkend manuelt på vegne af ${memberName}`}
        disabled={working}
        onClick={() => void record()}
        size="sm"
        type="button"
        variant="secondary"
      >
        {working ? "Registrerer…" : "Godkend manuelt"}
      </Button>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
