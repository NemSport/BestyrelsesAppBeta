import { z } from "zod";
import { formatDanishDateKey } from "./date-format";
import { taskDeadlineLabels, taskStatusLabels } from "./tasks";

export const beforeTaskFollowUpReviewEvent =
  "meeting-task-follow-up-before-review";

export const followUpTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum([
    "not_started",
    "in_progress",
    "waiting",
    "completed",
    "cancelled",
  ]),
  deadline: z.string().nullable(),
  responsible_user_id: z.string().nullable(),
  responsible_name: z.string().nullable(),
  is_critical: z.boolean(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
  latest_note: z.string().nullable(),
});
export type FollowUpTask = z.infer<typeof followUpTaskSchema>;
export const followUpStateSchema = z.object({
  tasks: z.array(followUpTaskSchema),
  links: z.array(z.object({ task_id: z.string(), occurrence_id: z.string() })),
  events: z.array(
    z.object({
      id: z.string(),
      task_id: z.string(),
      action: z.string(),
      note: z.string(),
      created_at: z.string(),
      actor_name: z.string().nullable(),
      before_state: followUpTaskSchema.nullable(),
      after_state: followUpTaskSchema,
    }),
  ),
  occurrences: z.array(z.object({ id: z.string(), title: z.string() })),
  people: z.array(z.object({ id: z.string(), name: z.string() })),
  snapshots: z.array(
    z.object({
      id: z.string(),
      sent_at: z.string(),
      delivery_status: z.string(),
      task_snapshot: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          status: z.string(),
          deadline: z.string().nullable(),
          responsible_name: z.string().nullable(),
        }),
      ),
    }),
  ),
  writable: z.boolean(),
});
export type FollowUpState = z.infer<typeof followUpStateSchema>;
export const followUpScopeSchema = z.object({
  organizationId: z.string().uuid(),
  committeeId: z.string().uuid(),
  meetingId: z.string().uuid(),
});
export const followUpMutationSchema = followUpScopeSchema.extend({
  requestId: z.string().uuid(),
  taskId: z.string().uuid(),
  action: z.enum(["update", "link"]),
  expectedVersion: z.string().datetime({ offset: true }),
  status: followUpTaskSchema.shape.status.optional(),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  responsibleUserId: z.string().uuid().nullable().optional(),
  isCritical: z.boolean().optional(),
  note: z.string().trim().max(5000).default(""),
  occurrenceId: z.string().uuid().optional(),
});
export type FollowUpMutation = z.infer<typeof followUpMutationSchema>;

export function followUpReasons(task: FollowUpTask, now = new Date()) {
  if (task.archived_at || ["completed", "cancelled"].includes(task.status))
    return [];
  const today = formatDanishDateKey(now);
  const through = new Date(`${today}T12:00:00Z`);
  through.setUTCDate(through.getUTCDate() + 7);
  const reasons: string[] = [];
  if (task.is_critical) reasons.push("Kritisk");
  if (task.deadline && task.deadline < today)
    reasons.push(taskDeadlineLabels.overdue);
  else if (task.deadline && task.deadline <= formatDanishDateKey(through))
    reasons.push(
      task.deadline === today ? taskDeadlineLabels.today : taskDeadlineLabels.soon,
    );
  if (task.status === "waiting") reasons.push(taskStatusLabels.waiting);
  return reasons;
}

export function activeFollowUpTasks(
  tasks: FollowUpTask[],
  attentionOnly: boolean,
  now = new Date(),
) {
  return tasks
    .filter(
      (task) =>
        !task.archived_at &&
        !["completed", "cancelled"].includes(task.status) &&
        (!attentionOnly || followUpReasons(task, now).length > 0),
    )
    .sort(
      (a, b) =>
        Number(b.is_critical) - Number(a.is_critical) ||
        (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
        a.title.localeCompare(b.title, "da"),
    );
}
