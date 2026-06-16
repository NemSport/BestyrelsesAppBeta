import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { defaultJobCardAiModel, getAiEnv } from "@/lib/ai-env";
import { AppError, NotFoundError } from "@/lib/errors";
import {
  jobCardAiInstructions,
  jobCardAiOutputSchema,
  jobCardAiPromptVersion,
  jobCardAiRequestSchema,
} from "@/lib/job-card-ai";
import { richTextToPlainText } from "@/lib/rich-text";
import { JobCardRepository } from "@/repositories/job-card-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

export class JobCardAiService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async suggest(input: unknown) {
    const parsed = jobCardAiRequestSchema.parse(input);
    const user = await new AuthService(this.db).requireUser();
    await new AuthorizationService(this.db).requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    const jobCards = new JobCardRepository(this.db);
    const currentRole = parsed.roleProfileId
      ? await jobCards.findRole(parsed.roleProfileId)
      : null;
    if (
      parsed.roleProfileId &&
      (!currentRole || currentRole.organization_id !== parsed.organizationId)
    ) {
      throw new NotFoundError("Jobkortet");
    }
    const [tasks, decisions, annualWheel, pointMinutes, meetingMinutes, committees] =
      await Promise.all([
        this.db.from("tasks").select("id,title,description,category,committee_id,responsible_user_id").eq("organization_id", parsed.organizationId).is("archived_at", null).limit(80),
        this.db.from("decisions").select("id,title,description,category,committee_id").eq("organization_id", parsed.organizationId).limit(60),
        this.db.from("annual_wheel_events").select("id,title,description,category,committee_id,starts_on").eq("organization_id", parsed.organizationId).is("deleted_at", null).limit(80),
        this.db.from("agenda_item_minutes").select("id,notes,decision,follow_up,committee_id").eq("organization_id", parsed.organizationId).limit(60),
        this.db.from("meeting_minutes").select("id,minutes_text,decisions,committee_id").eq("organization_id", parsed.organizationId).limit(40),
        this.db.from("committees").select("id,name").eq("organization_id", parsed.organizationId).is("archived_at", null).is("deleted_at", null),
      ]);
    const error = [tasks, decisions, annualWheel, pointMinutes, meetingMinutes, committees].find((result) => result.error)?.error;
    if (error) throw error;
    const committeeMap = new Map((committees.data ?? []).map((committee) => [committee.id, committee.name]));
    const sources = [
      ...(currentRole ? [{ id: `role:${currentRole.id}`, label: `Eksisterende jobkort: ${currentRole.title}`, content: JSON.stringify(currentRole) }] : []),
      { id: "history:tasks", label: "Historiske opgaver", content: (tasks.data ?? []).map((task) => `${committeeMap.get(task.committee_id) ?? "Udvalg"}: ${task.title} | ${task.description} | ${task.category ?? ""}`).join("\n") },
      { id: "history:decisions", label: "Historiske beslutninger", content: (decisions.data ?? []).map((decision) => `${committeeMap.get(decision.committee_id) ?? "Udvalg"}: ${decision.title} | ${decision.description}`).join("\n") },
      { id: "history:annual-wheel", label: "Årshjul", content: (annualWheel.data ?? []).map((event) => `${event.starts_on}: ${event.title} | ${event.description}`).join("\n") },
      { id: "history:minutes", label: "Referater", content: [...(pointMinutes.data ?? []).map((minutes) => [minutes.notes, minutes.decision, minutes.follow_up].map(richTextToPlainText).join(" ")), ...(meetingMinutes.data ?? []).map((minutes) => [minutes.minutes_text, minutes.decisions].map(richTextToPlainText).join(" "))].join("\n").slice(0, 30000) },
    ].filter((source) => source.content.trim());
    if (!sources.length) {
      throw new AppError("Der er ikke nok historik til at foreslå et jobkort endnu.", 422, "INSUFFICIENT_HISTORY");
    }
    const selectedModel = process.env.OPENAI_JOB_CARD_MODEL?.trim() || defaultJobCardAiModel;
    try {
      const env = getAiEnv();
      const response = await new OpenAI({ apiKey: env.OPENAI_API_KEY }).responses.parse({
        model: env.OPENAI_JOB_CARD_MODEL,
        store: false,
        text: { format: zodTextFormat(jobCardAiOutputSchema, "job_card_draft") },
        input: [
          { role: "system", content: jobCardAiInstructions },
          { role: "user", content: ["KILDER:", ...sources.map((source) => `[${source.id}] ${source.label}\n${source.content}`)].join("\n\n") },
        ],
      });
      if (!response.output_parsed) throw new AppError("AI returnerede ikke et gyldigt jobkortudkast.", 502, "AI_INVALID_OUTPUT");
      const allowed = new Set(sources.map((source) => source.id));
      const validSourceIds = response.output_parsed.sourceIds.filter((id) => allowed.has(id));
      if (!validSourceIds.length) throw new AppError("AI-udkastet manglede gyldige kilder.", 502, "AI_UNGROUNDED_OUTPUT");
      return {
        ...response.output_parsed,
        sourceIds: validSourceIds,
        sources: sources.map(({ id, label }) => ({ id, label })),
        meta: { model: env.OPENAI_JOB_CARD_MODEL, promptVersion: jobCardAiPromptVersion },
      };
    } catch (error) {
      console.error("[job-card-ai] analyse fejlede", {
        organizationId: parsed.organizationId,
        roleProfileId: parsed.roleProfileId ?? null,
        model: selectedModel,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Ukendt AI-fejl",
      });
      if (error instanceof AppError) throw error;
      throw new AppError("AI kunne ikke foreslå et jobkort. Prøv igen senere.", 502, "JOB_CARD_AI_FAILED");
    }
  }
}
