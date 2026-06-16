import Link from "next/link";

import { StatusBadge } from "@/components/ui";
import { taskStatusLabels, taskStatusTones } from "@/lib/tasks";
import type { TaskView } from "@/types/domain";

function formatDate(value: string | null) {
  if (!value) return "Ingen deadline";
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

export function RelatedTasks({
  tasks,
  organizationId,
  compact = false,
}: {
  tasks: TaskView[];
  organizationId: string;
  compact?: boolean;
}) {
  if (!tasks.length) {
    return compact ? (
      <p className="text-xs text-muted">Ingen relaterede opgaver.</p>
    ) : null;
  }

  return (
    <div className="divide-y divide-line border-y border-line">
      {tasks.map((task) => (
        <article className={compact ? "py-2.5" : "py-3"} key={task.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <Link
                className="font-semibold text-brand hover:underline"
                href={`/organizations/${organizationId}/tasks#task-${task.id}`}
              >
                {task.title}
              </Link>
              <p className="mt-0.5 text-xs text-muted">
                {task.responsible?.full_name || "Ingen ansvarlig"} ·{" "}
                {task.deadline
                  ? `Deadline ${formatDate(task.deadline)}`
                  : "Ingen deadline"}
              </p>
            </div>
            <StatusBadge tone={taskStatusTones[task.status]}>
              {taskStatusLabels[task.status]}
            </StatusBadge>
          </div>
        </article>
      ))}
    </div>
  );
}
