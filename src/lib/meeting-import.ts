import { z } from "zod";

export const meetingImportMaxBytes = 4_000_000;
export const meetingImportMaxFiles = 4;

const text = (max: number) => z.string().trim().max(max);
const source = z.object({
  file: z.number().int().min(1).max(meetingImportMaxFiles),
  page: z.number().int().positive().nullable(),
});
const action = z.object({
  title: text(240),
  details: text(2000),
  completed: z.boolean(),
});
const task = action.extend({
  deadline: z.string().nullable(),
  namedOwner: text(160),
});
const item = z.object({
  title: text(200),
  notes: text(6000),
  source,
  decisions: z.array(action).max(8),
  tasks: z.array(task).max(8),
});
export const extractedMeetingImport = z.object({
  title: text(160),
  date: z.string().nullable(),
  time: z.string().nullable(),
  location: text(240),
  summary: text(8000),
  items: z.array(item).max(20),
  questions: z.array(z.object({ text: text(500), source })).max(24),
});

export type MeetingImportPreview = z.infer<typeof extractedMeetingImport>;

const approvalAction = action.extend({
  title: text(240).min(2, "Angiv en titel."),
});
const approvalTask = approvalAction.extend({
  deadline: z.string().date("Kontrollér opgavens frist.").or(z.literal("")),
  namedOwner: text(160),
  responsibleUserId: z.string().uuid().or(z.literal("")),
});
export const meetingImportApproval = z.object({
  analysisId: z.string().uuid(),
  title: text(160).min(2, "Angiv mødetitel."),
  date: z.string().date("Angiv en gyldig mødedato."),
  time: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Angiv et gyldigt klokkeslæt.")
    .or(z.literal("")),
  location: text(240),
  summary: text(8000),
  items: z
    .array(
      z.object({
        title: text(200).min(2, "Hvert dagsordenspunkt skal have en titel."),
        notes: text(6000),
        decisions: z.array(approvalAction).max(8),
        tasks: z.array(approvalTask).max(8),
      }),
    )
    .max(20),
});
export type MeetingImportApproval = z.infer<typeof meetingImportApproval>;
