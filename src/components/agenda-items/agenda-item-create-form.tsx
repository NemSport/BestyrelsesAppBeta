"use client";

import {
  ResourceForm,
  type ResourceFormField,
} from "@/components/forms/resource-form";
import { formatDate } from "@/lib/localization";
import type { Meeting } from "@/types/domain";

type MeetingOption = Pick<Meeting, "id" | "title" | "starts_at">;

function getAgendaItemCreateFields(
  meetings: MeetingOption[],
  defaultMeetingId: string | null,
  allowMeetingSelection: boolean,
): ResourceFormField[] {
  const defaultMode =
    allowMeetingSelection && defaultMeetingId ? "meeting" : "date";
  return [
    {
      name: "title",
      label: "Titel",
      required: true,
      requiredMessage: "Titel skal udfyldes",
    },
    {
      name: "objective",
      label: "Formål med beslutning eller drøftelse",
      type: "textarea",
    },
    { name: "description", label: "Baggrund", type: "textarea" },
    {
      name: "itemType",
      label: "Type",
      type: "select",
      defaultValue: "discussion",
      options: [
        { label: "D / Drøftelse", value: "discussion" },
        { label: "B / Beslutning", value: "decision" },
        { label: "O / Orientering", value: "information" },
        { label: "F / Opfølgning", value: "follow_up" },
      ],
    },
    {
      name: "scheduleMode",
      label: "Placering",
      type: "radio",
      defaultValue: defaultMode,
      options: allowMeetingSelection
        ? [
            {
              label: "Tilknyt til eksisterende møde",
              value: "meeting",
            },
            { label: "Vælg dato", value: "date" },
          ]
        : [{ label: "Vælg dato", value: "date" }],
    },
    {
      name: "meetingId",
      label: "Møde",
      type: "select",
      required: true,
      requiredMessage: "Vælg enten et møde eller en dato.",
      defaultValue: defaultMeetingId ?? meetings[0]?.id ?? "",
      visibleWhen: { field: "scheduleMode", equals: "meeting" },
      options: [
        { label: "Vælg møde", value: "" },
        ...meetings.map((meeting) => ({
          label: `${meeting.title} – ${formatDate(meeting.starts_at)}`,
          value: meeting.id,
        })),
      ],
    },
    {
      name: "targetDate",
      label: "Dato",
      type: "date",
      required: true,
      requiredMessage: "Vælg enten et møde eller en dato.",
      visibleWhen: { field: "scheduleMode", equals: "date" },
    },
  ];
}

export function AgendaItemCreateForm({
  organizationId,
  committeeId,
  meetingId,
  meetings,
  allowMeetingSelection = true,
  successPath,
  onSuccess,
  onCancel,
  submitLabel,
}: {
  organizationId: string;
  committeeId: string;
  meetingId?: string | null;
  meetings: MeetingOption[];
  allowMeetingSelection?: boolean;
  successPath?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  submitLabel: string;
}) {
  return (
    <ResourceForm
      endpoint={`/api/committees/${committeeId}/agenda-items`}
      fields={getAgendaItemCreateFields(
        meetings,
        meetingId ?? null,
        allowMeetingSelection,
      )}
      hidden={{
        organizationId,
        committeeId,
      }}
      onSuccess={onSuccess}
      secondaryAction={
        onCancel ? { label: "Annuller", onClick: onCancel } : undefined
      }
      submitLabel={submitLabel}
      successPath={successPath}
    />
  );
}
