import "server-only";

import webPush from "web-push";
import { bestiePushConfig, bestiePushEndpoint } from "@/lib/bestie-push";
import { createAdminClient } from "@/lib/supabase/admin";

type PushConfig = NonNullable<ReturnType<typeof bestiePushConfig>>;
type Subscription = {
  user_id: string;
  endpoint: string;
  keys: unknown;
};

export type EmailPush = {
  path: string;
  body: string;
};

export async function sendDevicePush(
  db: ReturnType<typeof createAdminClient>,
  { endpoint, keys, user_id }: Subscription,
  payload: EmailPush & { tag: string; kind?: "email" | "agenda" },
  config: PushConfig,
) {
  if (
    !bestiePushEndpoint(endpoint) ||
    !keys ||
    typeof keys !== "object" ||
    !("p256dh" in keys) ||
    !("auth" in keys) ||
    typeof keys.p256dh !== "string" ||
    typeof keys.auth !== "string"
  ) return false;

  try {
    await webPush.sendNotification(
      { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      JSON.stringify(payload),
      {
        TTL: 86400,
        timeout: 4000,
        vapidDetails: config,
        topic: payload.tag.replaceAll("-", ""),
      },
    );
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) {
      await db.from("bestie_push_subscriptions").delete()
        .eq("endpoint", endpoint).eq("user_id", user_id);
    } else {
      console.warn("[push] Push delivery failed", { status });
    }
    return false;
  }
}

export async function sendEmailPushes(
  messages: { to: string[]; push: EmailPush }[],
) {
  const config = bestiePushConfig();
  if (!config) return;

  const byEmail = new Map<string, EmailPush>();
  for (const { to, push } of messages) {
    for (const email of to) byEmail.set(email.trim().toLowerCase(), push);
  }
  if (!byEmail.size) return;

  const db = createAdminClient();
  const { data, error } = await db.rpc("email_push_subscriptions", {
    recipient_emails: [...byEmail.keys()],
  });
  if (error) throw error;

  const tag = crypto.randomUUID();
  await Promise.all(data.map((subscription) => {
    const push = byEmail.get(subscription.email);
    if (push) {
      return sendDevicePush(db, subscription, { ...push, tag, kind: "email" }, config);
    }
  }));
}
