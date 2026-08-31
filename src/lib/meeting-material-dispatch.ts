import { z } from "zod";

import type { MeetingMaterialRecipientSnapshot } from "@/types/meeting-materials";

export const meetingMaterialContentTypes = [
  "agenda",
  "tasks",
  "minutes",
] as const;

export const meetingMaterialDispatchSchema = z
  .object({
    organizationId: z.string().uuid("Ugyldigt organisations-id"),
    committeeId: z.string().uuid("Ugyldigt udvalgs-id"),
    meetingId: z.string().uuid("Ugyldigt møde-id"),
    contentTypes: z
      .array(z.enum(meetingMaterialContentTypes))
      .min(1, "Vælg mindst én type mødemateriale")
      .max(3)
      .transform((values) => [...new Set(values)]),
    taskListMode: z.enum(["general", "personal"]).nullable().optional(),
    includeAttachments: z.boolean().default(false),
    documentIds: z.array(z.string().uuid()).max(10).default([]),
    recipientMode: z.enum(["participants", "selected"]),
    recipientUserIds: z.array(z.string().uuid()).max(250).default([]),
    subject: z.string().trim().min(3, "Emne skal udfyldes").max(180),
    message: z.string().trim().max(2000).default(""),
  })
  .superRefine((value, context) => {
    const sendsTasks = value.contentTypes.includes("tasks");
    if (sendsTasks && !value.taskListMode) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vælg om opgavelisten skal være generel eller personlig.",
        path: ["taskListMode"],
      });
    }
    if (!sendsTasks && value.taskListMode) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Opgavelistetype kræver, at Opgaveliste er valgt.",
        path: ["taskListMode"],
      });
    }
    if (!value.includeAttachments && value.documentIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vælg Medtag bilag før dokumenter vælges.",
        path: ["documentIds"],
      });
    }
    if (value.recipientMode === "selected" && !value.recipientUserIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vælg mindst én modtager.",
        path: ["recipientUserIds"],
      });
    }
  });

export function tasksForRecipient<
  T extends { responsible_user_id: string | null },
>(tasks: T[], userId: string | null) {
  return userId
    ? tasks.filter((task) => task.responsible_user_id === userId)
    : [];
}

type DispatchMember = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  status: string;
  committees?: Array<{ id: string }>;
};

type DispatchInternalParticipant = {
  user_id: string;
  attendance_status: string;
};

type DispatchExternalParticipant = {
  id?: string;
  name: string;
  email: string | null;
};

export type UnavailableMeetingMaterialParticipant = {
  key: string;
  name: string;
  reason: "missing_email" | "inactive_or_missing_member";
};

function normalizedEmail(email: string | null | undefined) {
  return email?.trim() ?? "";
}

function uniqueRecipients(recipients: MeetingMaterialRecipientSnapshot[]) {
  return [
    ...new Map(
      recipients.map((recipient) => [
        recipient.email.toLocaleLowerCase("da-DK"),
        recipient,
      ]),
    ).values(),
  ];
}

export function resolveMeetingParticipantRecipients({
  committeeId,
  members,
  internalParticipants,
  externalParticipants,
}: {
  committeeId: string;
  members: DispatchMember[];
  internalParticipants: DispatchInternalParticipant[];
  externalParticipants: DispatchExternalParticipant[];
}) {
  const membersById = new Map(members.map((member) => [member.user_id, member]));
  const hasRegisteredParticipants =
    internalParticipants.length > 0 || externalParticipants.length > 0;
  const eligibleInternalParticipants = hasRegisteredParticipants
    ? internalParticipants.filter(
        (participant) =>
          !["declined", "absent", "excused"].includes(
            participant.attendance_status,
          ),
      )
    : members
        .filter(
          (member) =>
            member.status === "active" &&
            member.committees?.some((committee) => committee.id === committeeId),
        )
        .map((member) => ({
          user_id: member.user_id,
          attendance_status: "committee_fallback",
        }));

  const unavailableParticipants: UnavailableMeetingMaterialParticipant[] = [];
  const resolvedParticipants: MeetingMaterialRecipientSnapshot[] = [];
  let participantsWithEmailCount = 0;

  for (const participant of eligibleInternalParticipants) {
    const member = membersById.get(participant.user_id);
    const name =
      member?.full_name?.trim() ||
      normalizedEmail(member?.email) ||
      "Ukendt eller inaktiv intern deltager";
    if (!member || member.status !== "active") {
      unavailableParticipants.push({
        key: `member:${participant.user_id}`,
        name,
        reason: "inactive_or_missing_member",
      });
      continue;
    }
    const email = normalizedEmail(member.email);
    if (!email) {
      unavailableParticipants.push({
        key: `member:${participant.user_id}`,
        name,
        reason: "missing_email",
      });
      continue;
    }
    participantsWithEmailCount += 1;
    resolvedParticipants.push({
      kind: "member",
      userId: member.user_id,
      name,
      email,
    });
  }

  for (const [index, participant] of externalParticipants.entries()) {
    const name = participant.name.trim() || "Ekstern deltager";
    const email = normalizedEmail(participant.email);
    const key = `external:${participant.id ?? index}`;
    if (!email) {
      unavailableParticipants.push({
        key,
        name,
        reason: "missing_email",
      });
      continue;
    }
    participantsWithEmailCount += 1;
    resolvedParticipants.push({
      kind: "external",
      userId: null,
      name,
      email,
    });
  }

  return {
    recipients: uniqueRecipients(resolvedParticipants),
    totalParticipantCount:
      eligibleInternalParticipants.length + externalParticipants.length,
    participantsWithEmailCount,
    unavailableParticipants,
    usedCommitteeFallback: !hasRegisteredParticipants,
  };
}

export function resolveSelectedMeetingMaterialRecipients({
  members,
  selectedUserIds,
}: {
  members: DispatchMember[];
  selectedUserIds: string[];
}) {
  const membersById = new Map(
    members
      .filter((member) => member.status === "active")
      .map((member) => [member.user_id, member]),
  );
  const uniqueIds = [...new Set(selectedUserIds)];
  const invalidUserIds: string[] = [];
  const recipients = uniqueIds.flatMap((userId) => {
    const member = membersById.get(userId);
    const email = normalizedEmail(member?.email);
    if (!member || !email) {
      invalidUserIds.push(userId);
      return [];
    }
    return [{
      kind: "member" as const,
      userId,
      name: member.full_name?.trim() || email,
      email,
    }];
  });
  return {
    recipients: uniqueRecipients(recipients),
    invalidUserIds,
  };
}

export const meetingMaterialContentLabels = {
  agenda: "Dagsorden",
  tasks: "Opgaveliste",
  minutes: "Referat",
} as const;
