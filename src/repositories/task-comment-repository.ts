import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert } from "@/types/database";
import type { TaskCommentView } from "@/types/domain";

export class TaskCommentRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  private readonly viewSelect =
    "*, author:profiles!task_comments_created_by_fkey(id, full_name)";

  async listByTask(taskId: string) {
    const { data, error } = await this.db
      .from("task_comments")
      .select(this.viewSelect)
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as TaskCommentView[];
  }

  async create(input: TableInsert<"task_comments">) {
    const { data, error } = await this.db
      .from("task_comments")
      .insert(input)
      .select(this.viewSelect)
      .single();
    if (error) throw error;
    return data as unknown as TaskCommentView;
  }
}
