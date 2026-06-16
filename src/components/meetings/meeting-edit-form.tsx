"use client";

import { ResourceForm } from "@/components/forms/resource-form";
import { toDateTimeLocal } from "@/lib/localization";
import type { Meeting } from "@/types/domain";

export function MeetingEditForm({
  organizationId,
  committeeId,
  meeting,
  successPath,
  onSuccess,
  onCancel,
}: {
  organizationId: string;
  committeeId: string;
  meeting: Meeting;
  successPath?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  return (
    <ResourceForm
      endpoint={`/api/meetings/${meeting.id}`}
      fields={[
        {
          name: "title",
          label: "Titel",
          required: true,
          requiredMessage: "Titel skal udfyldes",
          defaultValue: meeting.title,
        },
        {
          name: "description",
          label: "Beskrivelse",
          type: "textarea",
          defaultValue: meeting.description,
        },
        {
          name: "startsAt",
          label: "Startdato",
          type: "datetime-local",
          required: true,
          requiredMessage: "Startdato mangler",
          defaultValue: toDateTimeLocal(meeting.starts_at),
        },
        {
          name: "endsAt",
          label: "Slutdato",
          type: "datetime-local",
          defaultValue: toDateTimeLocal(meeting.ends_at),
        },
        {
          name: "location",
          label: "Sted",
          defaultValue: meeting.location,
        },
      ]}
      hidden={{ organizationId, committeeId }}
      method="PATCH"
      onSuccess={onSuccess}
      secondaryAction={
        onCancel ? { label: "Annuller", onClick: onCancel } : undefined
      }
      submitLabel="Gem ændringer"
      successPath={successPath}
    />
  );
}
