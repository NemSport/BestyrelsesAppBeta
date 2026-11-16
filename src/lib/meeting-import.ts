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
  namedOwner: text(160),
  deadlineStatus: z.enum(["not_mentioned", "readable", "unreadable"]),
  deadline: z.string().nullable(),
});
const item = z.object({
  title: text(200),
  source,
  tasks: z.array(task).max(8),
  decisions: z.array(action).max(8),
  notes: text(6000),
});
export const extractedMeetingImport = z.object({
  title: text(160),
  date: z.string().nullable(),
  time: z.string().nullable(),
  location: text(240),
  summary: text(8000),
  participantAliases: z
    .array(z.object({ initials: text(20), name: text(160), source }))
    .max(40),
  items: z.array(item).max(20),
  questions: z.array(z.object({ text: text(500), source })).max(24),
});

export type MeetingImportPreview = z.infer<typeof extractedMeetingImport>;

export const extractedMeetingFollowUps = z.object({
  groups: z
    .array(
      z.object({
        pointNumber: z.number().int().min(1).max(20),
        tasks: z.array(task).max(8),
      }),
    )
    .max(20),
});

export function addCheckedMeetingFollowUps(
  meeting: MeetingImportPreview,
  checked: z.infer<typeof extractedMeetingFollowUps> | null,
): MeetingImportPreview {
  if (!checked)
    return {
      ...meeting,
      questions: [
        ...meeting.questions,
        {
          text: "Bestie kunne ikke kontrollere opfølgningerne særskilt. Gennemgå de aftalte handlinger i kilden.",
          source: { file: 1, page: null },
        },
      ],
    };

  const items = meeting.items.map((item) => ({ ...item }));
  const questions = [...meeting.questions];
  for (const group of checked.groups) {
    const item = items[group.pointNumber - 1];
    if (!item || !group.tasks.length) continue;
    const known = item.tasks.map(({ title, namedOwner }) => ({
      title: normalizeParticipantName(title),
      owner: normalizeParticipantName(namedOwner),
    }));
    const additions = group.tasks.filter(({ title, namedOwner }) => {
      const normalizedTitle = normalizeParticipantName(title);
      const owner = normalizeParticipantName(namedOwner);
      if (
        !normalizedTitle ||
        known.some(
          (entry) =>
            entry.title === normalizedTitle &&
            (!entry.owner || !owner || entry.owner === owner),
        )
      )
        return false;
      known.push({ title: normalizedTitle, owner });
      return true;
    });
    const capacity = 8 - item.tasks.length;
    item.tasks = [...item.tasks, ...additions.slice(0, capacity)];
    const remaining = additions.slice(capacity);
    if (remaining.length)
      questions.push({
        text: `Flere mulige opfølgninger under ${item.title}: ${remaining.map(({ title }) => title).join("; ")}`,
        source: item.source,
      });
  }
  return { ...meeting, items, questions };
}

export function clarifyMeetingImportDeadlines(
  meeting: MeetingImportPreview,
): MeetingImportPreview {
  const questions = [...meeting.questions];
  const items = meeting.items.map((item) => ({
    ...item,
    tasks: item.tasks.map((task) => {
      if (task.deadlineStatus !== "unreadable") return task;
      const owner = normalizeParticipantName(task.namedOwner);
      const names = new Set(
        meeting.participantAliases
          .filter(
            ({ initials }) =>
              owner && normalizeParticipantName(initials) === owner,
          )
          .map(({ name }) => name),
      );
      const name =
        names.size === 1 ? names.values().next().value : task.namedOwner;
      questions.push({
        text: `Fristen for “${task.title}”${name ? ` (${name})` : ""} kan ikke læses i kilden.`,
        source: item.source,
      });
      return { ...task, deadline: null };
    }),
  }));
  return { ...meeting, items, questions };
}

function normalizeParticipantName(value: string) {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("da-DK")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function suggestMeetingImportAssignee(
  sourceName: string,
  aliases: MeetingImportPreview["participantAliases"],
  members: readonly { id: string; name: string }[],
) {
  const name = normalizeParticipantName(sourceName);
  if (!name) return "";
  const expansions = new Set(
    aliases
      .filter(({ initials }) => normalizeParticipantName(initials) === name)
      .map((alias) => normalizeParticipantName(alias.name))
      .filter((value) => value.includes(" ")),
  );
  if (expansions.size > 1) return "";
  const lookup = expansions.values().next().value ?? name;
  // Assign only a complete name with a unique exact match in this committee.
  if (!lookup.includes(" ")) return "";
  const matching = members.filter(
    (member) => normalizeParticipantName(member.name) === lookup,
  );
  return matching.length === 1 ? matching[0].id : "";
}

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
