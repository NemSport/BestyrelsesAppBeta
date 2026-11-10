import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { AppError } from "@/lib/errors";
import {
  followUpStateSchema,
  type FollowUpMutation,
} from "@/lib/meeting-task-follow-up";

function check(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "40001")
    throw new AppError(error.message, 409, "TASK_CONFLICT");
  if (error.code === "42501")
    throw new AppError("Du har ikke adgang til handlingen.", 403);
  if (error.code === "22023") throw new AppError(error.message, 422);
  throw error;
}

export class MeetingTaskFollowUpRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}
  async read(meetingId: string) {
    const { data, error } = await this.db.rpc("read_meeting_task_follow_up", {
      target_meeting_id: meetingId,
    });
    check(error);
    return followUpStateSchema.parse(data);
  }
  async ensure(meetingId: string) {
    const { data, error } = await this.db.rpc("ensure_meeting_task_follow_up", {
      target_meeting_id: meetingId,
    });
    check(error);
    return data;
  }
  async mutate(input: FollowUpMutation) {
    const { error } = await this.db.rpc("mutate_meeting_task_follow_up", {
      target_meeting_id: input.meetingId,
      target_task_id: input.taskId,
      request_id: input.requestId,
      expected_version: input.expectedVersion,
      mutation: input as unknown as Json,
    });
    check(error);
  }
}
