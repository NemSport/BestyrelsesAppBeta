import { z } from "zod";

export const meetingSchedulingScope = z.object({
  organizationId: z.string().uuid(),
  committeeId: z.string().uuid(),
});
export const meetingDatePollInput = meetingSchedulingScope.extend({
  title: z.string().trim().min(2).max(180),
  options: z
    .array(z.string().datetime({ offset: true }))
    .min(2)
    .max(12)
    .transform((values) =>
      [...new Set(values.map((value) => new Date(value).toISOString()))].sort(),
    )
    .refine(
      (values) =>
        values.length >= 2 &&
        values.every((value) => Date.parse(value) > Date.now()),
    ),
  memberIds: z.array(z.string().uuid()).max(500).default([]),
  emails: z
    .array(
      z
        .string()
        .trim()
        .max(254)
        .email()
        .transform((value) => value.toLowerCase()),
    )
    .max(50)
    .transform((values) => [...new Set(values)]),
});
export const meetingVoteAnswers = {
  yes: "Ja",
  maybe: "Måske",
  no: "Nej",
} as const;

export const meetingVoteInput = z.object({
  answers: z.array(z.enum(["yes", "maybe", "no"])).min(1).max(12),
  comment: z.string().trim().max(500),
});

export function meetingVoteAnswer(
  voter: { choices: number[] | null; maybe_choices: number[] },
  option: number,
) {
  if (voter.choices === null) return null;
  if (voter.choices.includes(option)) return "yes";
  return voter.maybe_choices.includes(option) ? "maybe" : "no";
}
export const meetingResponseInput = z.enum(["accepted", "declined"]);

export function meetingCanReceiveResponses(meeting: {
  starts_at: string;
  status: string;
}) {
  return (
    ["draft", "scheduled"].includes(meeting.status) &&
    Date.parse(meeting.starts_at) > Date.now()
  );
}

export function meetingResponseLabel(
  response: z.infer<typeof meetingResponseInput> | null,
) {
  return response === "accepted"
    ? "Deltager"
    : response === "declined"
      ? "Deltager ikke"
      : "Afventer svar";
}
