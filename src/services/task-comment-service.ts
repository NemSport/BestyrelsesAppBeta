import type { SupabaseClient } from "@supabase/supabase-js";

import { NotFoundError } from "@/lib/errors";
import { taskCommentInputSchema, uuidSchema } from "@/lib/validation";
import { TaskCommentRepository } from "@/repositories/task-comment-repository";
import { TaskRepository } from "@/repositories/task-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

export class TaskCommentService {
  private readonly comments: TaskCommentRepository;
  private readonly tasks: TaskRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.comments = new TaskCommentRepository(db);
    this.tasks = new TaskRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async list(organizationId: string, taskId: string) {
    const user = await this.auth.requireUser();
    const task = await this.requireTask(organizationId, taskId);
    await this.authorization.requireCommitteeMember(
      organizationId,
      task.committee_id,
      user.id,
    );
    return this.comments.listByTask(task.id);
  }

  async create(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = taskCommentInputSchema.parse(input);
    const task = await this.requireTask(parsed.organizationId, parsed.taskId);
    await this.authorization.requireAgendaItemEditor(
      parsed.organizationId,
      task.committee_id,
      user.id,
    );
    return this.comments.create({
      task_id: task.id,
      organization_id: task.organization_id,
      committee_id: task.committee_id,
      body: parsed.body,
      created_by: user.id,
    });
  }

  private async requireTask(organizationId: string, taskId: string) {
    uuidSchema.parse(organizationId);
    uuidSchema.parse(taskId);
    const task = await this.tasks.findById(taskId);
    if (!task || task.organization_id !== organizationId) {
      throw new NotFoundError("Opgaven");
    }
    return task;
  }
}
