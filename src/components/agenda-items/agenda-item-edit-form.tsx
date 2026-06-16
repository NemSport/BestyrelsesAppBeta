"use client";

import { ResourceForm } from "@/components/forms/resource-form";
import type { AgendaItem } from "@/types/domain";

export function AgendaItemEditForm({
  organizationId,
  committeeId,
  item,
  successPath,
  onSuccess,
  onCancel,
}: {
  organizationId: string;
  committeeId: string;
  item: AgendaItem;
  successPath?: string;
  onSuccess?: (item: AgendaItem) => void;
  onCancel?: () => void;
}) {
  return (
    <ResourceForm
      endpoint={`/api/agenda-items/${item.id}`}
      fields={[
        {
          name: "title",
          label: "Titel",
          required: true,
          requiredMessage: "Titel skal udfyldes",
          defaultValue: item.title,
        },
        {
          name: "objective",
          label: "Formål med beslutning eller drøftelse",
          type: "textarea",
          defaultValue: item.objective,
        },
        {
          name: "description",
          label: "Baggrund",
          type: "textarea",
          defaultValue: item.description,
        },
        {
          name: "itemType",
          label: "Type",
          type: "select",
          defaultValue: item.item_type,
          options: [
            { label: "O / Orientering", value: "information" },
            { label: "D / Drøftelse", value: "discussion" },
            { label: "B / Beslutning", value: "decision" },
            { label: "F / Opfølgning", value: "follow_up" },
          ],
        },
        {
          name: "targetDate",
          label: "Måldato",
          type: "date",
          defaultValue: item.target_date,
        },
      ]}
      hidden={{ organizationId, committeeId }}
      key={`${item.id}:${item.updated_at}`}
      method="PATCH"
      onSuccess={
        onSuccess ? (result) => onSuccess(result as AgendaItem) : undefined
      }
      secondaryAction={
        onCancel ? { label: "Annuller", onClick: onCancel } : undefined
      }
      submitLabel="Gem ændringer"
      successPath={successPath}
    />
  );
}
