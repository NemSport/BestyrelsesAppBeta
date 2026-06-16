"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { AgendaItemCreateForm } from "@/components/agenda-items/agenda-item-create-form";
import { Button, Modal } from "@/components/ui";
import type { Meeting } from "@/types/domain";

export function AddAgendaItemModal({
  organizationId,
  committeeId,
  meetingId,
  meetings,
}: {
  organizationId: string;
  committeeId: string;
  meetingId: string;
  meetings: Array<Pick<Meeting, "id" | "title" | "starts_at">>;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);

  function created() {
    close();
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} size="sm">
        Tilføj dagsordenspunkt
      </Button>

      <Modal
        eyebrow="Dagsorden"
        onClose={close}
        open={isOpen}
        title="Tilføj dagsordenspunkt"
      >
        <AgendaItemCreateForm
          committeeId={committeeId}
          meetingId={meetingId}
          meetings={meetings}
          onCancel={close}
          onSuccess={created}
          organizationId={organizationId}
          submitLabel="Opret dagsordenspunkt"
        />
      </Modal>
    </>
  );
}
