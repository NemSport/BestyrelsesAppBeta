import type { SupabaseClient } from "@supabase/supabase-js";

import { bestiePath } from "@/lib/bestie";
import { bestiePushConfig } from "@/lib/bestie-push";
import { sendDevicePush } from "@/services/push-notification-service";
import type { Database, TableRow } from "@/types/database";

export class BestieDispatchService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async run(meetingId?: string) {
    const { data: generated, error } = meetingId
      ? { data: 0, error: null }
      : await this.db.rpc("bestie_generate_messages");
    if (error) throw error;
    const config = bestiePushConfig();
    if (!config) return { generated, delivered: 0 };

    const { data: threads, error: claimError } = meetingId
      ? await this.db.rpc("bestie_claim_meeting_pushes", {
          target_meeting: meetingId,
        })
      : await this.db.rpc("bestie_claim_pushes");
    if (claimError) throw claimError;
    let delivered = 0;
    for (let index = 0; index < threads.length; index += 10) {
      const results = await Promise.allSettled(
        threads.slice(index, index + 10).map((row) => this.send(row, config)),
      );
      delivered += results.filter(
        (result) => result.status === "fulfilled" && result.value,
      ).length;
      if (results.some((result) => result.status === "rejected")) {
        console.warn(
          "Bestie could not finish processing some push notifications.",
        );
      }
    }
    return { generated, delivered };
  }

  async sendToThread(threadId: string) {
    const config = bestiePushConfig();
    if (!config) return false;
    const { data, error } = await this.db.rpc("bestie_claim_thread_push", {
      target_thread: threadId,
    });
    if (error) throw error;
    return data[0] ? this.send(data[0], config) : false;
  }

  private async send(
    row: TableRow<"bestie_threads">,
    config: NonNullable<ReturnType<typeof bestiePushConfig>>,
  ) {
    const { data: subscriptions, error } = await this.db
      .from("bestie_push_subscriptions")
      .select("endpoint, keys")
      .eq("user_id", row.user_id);
    if (error) throw error;
    const payload = {
      body: row.meeting_id
        ? `${row.title}. Se dine opgaver, frister og beslutninger.`
        : row.dedup_key.startsWith("status-request:")
          ? `${row.title}. Åbn Bestie for at se eller svare på beskeden.`
          : row.event_id && row.task_id
            ? `Opfølgning fra årshjulet: ${row.title}.`
            : `${row.title}. Åbn Bestie for at svare.`,
      path: bestiePath(row.organization_id, row.id),
      api: `/api/organizations/${row.organization_id}/bestie/${row.id}`,
      tag: row.id,
      version: row.updated_at,
    };
    const sent = await Promise.all(
      subscriptions.map((subscription) =>
        sendDevicePush(
          this.db,
          { ...subscription, user_id: row.user_id },
          payload,
          config,
        ),
      ),
    );
    if (!sent.includes(true)) return false;

    const { error: updateError } = await this.db
      .from("bestie_threads")
      .update({ push_sent_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("updated_at", row.updated_at);
    if (updateError) throw updateError;
    return true;
  }
}
