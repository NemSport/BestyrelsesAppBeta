import type { TaskView } from "@/types/domain";

export function isOpenTransferredTask(
  task: Pick<TaskView, "archived_at" | "status">,
) {
  return (
    !task.archived_at &&
    task.status !== "completed" &&
    task.status !== "cancelled"
  );
}

export function mergeTransferredTaskReferences(
  currentTasks: TaskView[],
  sourceTasks: TaskView[],
) {
  const tasksById = new Map<string, TaskView>();
  for (const task of currentTasks) tasksById.set(task.id, task);
  for (const task of sourceTasks) {
    if (isOpenTransferredTask(task) && !tasksById.has(task.id)) {
      tasksById.set(task.id, task);
    }
  }
  return [...tasksById.values()];
}
