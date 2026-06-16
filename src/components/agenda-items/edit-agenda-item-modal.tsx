"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { AgendaItemEditForm } from "@/components/agenda-items/agenda-item-edit-form";
import { Button, Modal } from "@/components/ui";
import type { AgendaItem } from "@/types/domain";

export function EditAgendaItemModal({
  organizationId,
  committeeId,
  item,
  compact = false,
}: {
  organizationId: string;
  committeeId: string;
  item: AgendaItem;
  compact?: boolean;
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
      <Button
        onClick={() => setIsOpen(true)}
        size={compact ? "sm" : "md"}
        variant={compact ? "ghost" : "secondary"}
      >
        Rediger dagsordenspunkt
      </Button>
      <Modal
        description="Opdater punktet uden at miste dets mødehistorik."
        eyebrow="Dagsorden"
        onClose={close}
        open={isOpen}
        title="Rediger dagsordenspunkt"
      >
        <AgendaItemEditForm
          committeeId={committeeId}
          item={item}
          onCancel={close}
          onSuccess={updated}
          organizationId={organizationId}
        />
      </Modal>
    </>
  );
}
