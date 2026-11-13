import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { bestiePushConfig } from "@/lib/bestie-push";
import { BestieAgendaRepository } from "@/repositories/bestie-agenda-repository";
import { MeetingRepository } from "@/repositories/meeting-repository";
import { generateBestieAgendaDrafts } from "@/services/bestie-agenda-generation";
import { sendDevicePush } from "@/services/push-notification-service";
import type { BestieAgendaClaim, Database } from "@/types/database";

export class BestieAgendaDispatchService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async run() {
    const { data: claims, error } = await this.db.rpc("claim_bestie_agendas");
    if (error) throw error;
    const results = await Promise.allSettled(
      claims.map((claim) => this.prepareAndNotify(claim)),
    );
    const failed = results.filter(({ status }) => status === "rejected").length;
    if (failed)
      console.warn("Bestie could not process some agenda reminders.", {
        failed,
      });
    return {
      claimed: claims.length,
      delivered: results.filter(
        (result) => result.status === "fulfilled" && result.value,
      ).length,
      failed,
    };
  }

  private async prepareAndNotify(claim: BestieAgendaClaim) {
    const {
      meeting_id: meetingId,
      user_id: userId,
      organization_id: organizationId,
      committee_id: committeeId,
    } = claim;
    if (!claim.prepared_at) {
      const [next] = await new MeetingRepository(this.db).listWorkspaceMeetings(
        organizationId,
        committeeId,
        new Date().toISOString(),
      );
      if (next?.id !== meetingId) return false;
      const { drafts, metadata } = await generateBestieAgendaDrafts(
        this.db,
        next,
      );
      const { data: prepared, error } = await this.db.rpc(
        "save_proactive_bestie_agenda_drafts",
        {
          target_meeting: meetingId,
          reviewer: userId,
          claim_time: claim.claimed_at,
          drafts,
          generation_log: metadata,
        },
      );
      if (error) throw error;
      if (!prepared) return false;
    }

    const [due, drafts] = await Promise.all([
      this.db
        .from("bestie_due_agendas")
        .select("meeting_id")
        .eq("meeting_id", meetingId)
        .eq("user_id", userId)
        .maybeSingle(),
      new BestieAgendaRepository(this.db).listDrafts(meetingId),
    ]);
    if (due.error) throw due.error;
    if (!due.data) return false;

    let delivered = false;
    if (drafts.length) {
      const config = bestiePushConfig();
      if (!config) return false;
      const { data: subscriptions, error } = await this.db
        .from("bestie_push_subscriptions")
        .select("user_id, endpoint, keys")
        .eq("user_id", userId);
      if (error) throw error;
      const results = await Promise.all(
        subscriptions.map((subscription) =>
          sendDevicePush(
            this.db,
            subscription,
            {
              kind: "agenda",
              body: "Bestie har dagsordensforslag klar. Åbn mødet for at gennemgå dem.",
              path: `/organizations/${organizationId}/committees/${committeeId}/meetings/${meetingId}?view=preparation#bestie-agenda-heading`,
              tag: meetingId,
            },
            config,
          ),
        ),
      );
      delivered = results.includes(true);
      if (!delivered) return false;
    }

    const finishedAt = new Date().toISOString();
    const { error } = await this.db
      .from("bestie_agenda_reminders")
      .update({
        finished_at: finishedAt,
        push_sent_at: delivered ? finishedAt : null,
      })
      .eq("meeting_id", meetingId)
      .eq("user_id", userId)
      .eq("claimed_at", claim.claimed_at);
    if (error) throw error;
    return delivered;
  }
}
