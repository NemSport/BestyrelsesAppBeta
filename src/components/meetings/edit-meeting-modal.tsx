"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { MeetingEditForm } from "@/components/meetings/meeting-edit-form";
import { Button, Modal } from "@/components/ui";
import type { Meeting } from "@/types/domain";

export function EditMeetingModal({
  organizationId,
  committeeId,
  meeting,
}: {
  organizationId: string;
  committeeId: string;
  meeting: Meeting;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);

  function updated() {
    close();
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} size="sm" variant="secondary">
        Rediger møde
      </Button>
      <Modal
        description="Opdater mødetid og mødedetaljer."
        eyebrow="Møde"
        onClose={close}
        open={isOpen}
        title="Rediger møde"
      >
        <MeetingEditForm
          committeeId={committeeId}
          meeting={meeting}
          onCancel={close}
          onSuccess={updated}
          organizationId={organizationId}
        />
      </Modal>
    </>
  );
}
