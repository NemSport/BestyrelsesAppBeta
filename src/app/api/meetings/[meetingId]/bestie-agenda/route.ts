import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { bestieAgendaContent, bestieAgendaSource } from "@/lib/bestie-agenda";
import { AppError } from "@/lib/errors";
import { plainTextToRichText } from "@/lib/rich-text";
import { createClient } from "@/lib/supabase/server";
import { BestieAgendaRepository } from "@/repositories/bestie-agenda-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { AiActivityLogService } from "@/services/ai-activity-log-service";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { generateBestieAgendaDrafts } from "@/services/bestie-agenda-generation";

const scope = z.object({
  organizationId: z.string().uuid(),
  committeeId: z.string().uuid(),
});
const requestSchema = z.discriminatedUnion("action", [
  scope.extend({ action: z.literal("suggest") }),
  scope.extend({
    action: z.literal("approve"),
    suggestion: bestieAgendaSource,
    changes: bestieAgendaContent.optional(),
  }),
  scope.extend({
    action: z.literal("dismiss"),
    suggestion: bestieAgendaSource,
  }),
]);
export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const meetingId = z
      .string()
      .uuid()
      .parse((await params).meetingId);
    const input = requestSchema.parse(await request.json());
    const { organizationId, committeeId } = input;
    const db = await createClient();
    const user = await new AuthService(db).requireUser();
    await new AuthorizationService(db).requireMeetingCapability(
      organizationId,
      committeeId,
      user.id,
      "scheduleAgendaItem",
    );
    const meetings = new MeetingRepository(db);
    const [next] = await meetings.listWorkspaceMeetings(
      organizationId,
      committeeId,
      new Date().toISOString(),
    );
    if (next?.id !== meetingId) {
      throw new AppError(
        "Åbn udvalgets næste planlagte møde for at bruge Besties forslag.",
        409,
      );
    }

    if (input.action !== "suggest") {
      const drafts = await new BestieAgendaRepository(db).listDrafts(meetingId);
      const item = drafts.find(
        ({ sourceKind, sourceId }) =>
          sourceKind === input.suggestion.sourceKind &&
          sourceId === input.suggestion.sourceId,
      );
      if (!item)
        throw new AppError("Forslaget er ikke længere tilgængeligt.", 409);
      const dismiss = input.action === "dismiss";
      const content =
        input.action === "approve" ? (input.changes ?? item) : null;
      const { data, error } = await db.rpc("review_bestie_agenda_draft", {
        target_meeting: meetingId,
        target_org: organizationId,
        target_committee: committeeId,
        draft_kind: item.sourceKind,
        draft_source: item.sourceId,
        dismiss,
        edited_title: content?.title ?? null,
        rich_description: content && plainTextToRichText(content.description),
        rich_objective: content && plainTextToRichText(content.objective),
      });
      if (error) throw error;
      if (!data)
        throw new AppError(
          dismiss
            ? "Forslaget kunne ikke afvises. Genindlæs siden og prøv igen."
            : "Forslaget kan ikke tilføjes. Det kan allerede være på dagsordenen, eller mødet eller kilden kan være ændret.",
          409,
        );
      return NextResponse.json({ reviewed: true });
    }

    const { drafts: generated, metadata } = await generateBestieAgendaDrafts(
      db,
      next,
    );
    if (metadata) {
      const { model, promptVersion, ...details } = metadata;
      await new AiActivityLogService(db).recordGenerated({
        organizationId,
        meetingId,
        userId: user.id,
        field: "bestie_agenda",
        actionType: "generate_bestie_agenda",
        label: "Besties dagsordensforslag",
        model,
        promptVersion,
        metadata: details,
      });
    }
    if (!generated.length) return NextResponse.json({ added: 0 });

    const { data: saved, error } = await db.rpc("save_bestie_agenda_drafts", {
      target_meeting: meetingId,
      drafts: generated,
    });
    if (error) throw error;
    return NextResponse.json({ added: saved });
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Besties dagsordensforslag kunne ikke behandles.",
    });
  }
}
