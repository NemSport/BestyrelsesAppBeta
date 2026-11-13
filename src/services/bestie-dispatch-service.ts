import type { SupabaseClient } from "@supabase/supabase-js";
import webPush from "web-push";

import { bestiePath } from "@/lib/bestie";
import { bestiePushConfig, bestiePushEndpoint } from "@/lib/bestie-push";
import type { Database, TableRow } from "@/types/database";

export class BestieDispatchService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async run() {
    const { data: generated, error } = await this.db.rpc(
      "bestie_generate_messages",
    );
    if (error) throw error;
    const config = bestiePushConfig();
    if (!config) return { generated, delivered: 0 };

    const { data: threads, error: claimError } = await this.db.rpc(
      "bestie_claim_pushes",
    );
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

  private async send(
    row: TableRow<"bestie_threads">,
    config: NonNullable<ReturnType<typeof bestiePushConfig>>,
  ) {
    const { data: subscriptions, error } = await this.db
      .from("bestie_push_subscriptions")
      .select("endpoint, keys")
      .eq("user_id", row.user_id);
    if (error) throw error;
    const data = JSON.stringify({
      body: "Du har en ny besked fra Bestie.",
      path: bestiePath(row.organization_id, row.id),
      api: `/api/organizations/${row.organization_id}/bestie/${row.id}`,
      tag: row.id,
      version: row.updated_at,
    });
    const sent = await Promise.all(
      subscriptions.map(async ({ endpoint, keys }) => {
        if (
          !bestiePushEndpoint(endpoint) ||
          !keys ||
          typeof keys !== "object" ||
          Array.isArray(keys) ||
          typeof keys.p256dh !== "string" ||
          typeof keys.auth !== "string"
        )
          return false;
        try {
          await webPush.sendNotification(
            { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
            data,
            {
              TTL: 86400,
              timeout: 4000,
              vapidDetails: config,
              topic: row.id.replaceAll("-", ""),
            },
          );
          return true;
        } catch (error) {
          const status = (error as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            await this.db
              .from("bestie_push_subscriptions")
              .delete()
              .eq("endpoint", endpoint)
              .eq("user_id", row.user_id);
          }
          return false;
        }
      }),
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
