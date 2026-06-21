import type { SupabaseClient } from "@supabase/supabase-js";

import {
  aiActivityClientStatusSchema,
  limitAiActivityText,
} from "@/lib/ai-activity-log";
import { NotFoundError } from "@/lib/errors";
import { uuidSchema } from "@/lib/validation";
import { AiActivityLogRepository } from "@/repositories/ai-activity-log-repository";
import { AuthService } from "@/services/auth-service";
import type { Database, Json } from "@/types/database";

type AiActivityMetadata = Record<string, Json | undefined>;

type RecordGeneratedInput = {
  organizationId: string;
  meetingId?: string | null;
  agendaItemId?: string | null;
  userId: string;
  field: string;
  actionType: string;
  originalText?: string | null;
  aiSuggestion?: string | null;
  label: string;
  model?: string | null;
  promptVersion?: string | null;
  metadata?: AiActivityMetadata;
};

export class AiActivityLogService {
  private readonly activityLog: AiActivityLogRepository;
  private readonly auth: AuthService;

  constructor(db: SupabaseClient<Database>) {
    this.activityLog = new AiActivityLogRepository(db);
    this.auth = new AuthService(db);
  }

  async recordGenerated(input: RecordGeneratedInput) {
    return this.activityLog.create({
      organization_id: input.organizationId,
      meeting_id: input.meetingId ?? null,
      agenda_item_id: input.agendaItemId ?? null,
      user_id: input.userId,
      field: input.field,
      action_type: input.actionType,
      original_text: limitAiActivityText(input.originalText),
      ai_suggestion: limitAiActivityText(input.aiSuggestion),
      status: "generated",
      provider: "openai",
      model: input.model ?? null,
      prompt_version: input.promptVersion ?? null,
      label: input.label,
      metadata: input.metadata ?? {},
    });
  }

  async updateClientStatus(activityId: string, input: unknown) {
    const user = await this.auth.requireUser();
    uuidSchema.parse(activityId);
    const parsed = aiActivityClientStatusSchema.parse(input);

    try {
      return await this.activityLog.updateStatus(
        activityId,
        user.id,
        parsed.status,
      );
    } catch {
      throw new NotFoundError("AI-historikken");
    }
  }
}
