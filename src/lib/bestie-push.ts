import "server-only";

import { z } from "zod";

export function bestiePushEndpoint(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname;
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      (host === "fcm.googleapis.com" ||
        host === "updates.push.services.mozilla.com" ||
        host === "web.push.apple.com" ||
        host.endsWith(".web.push.apple.com")) &&
      url.pathname.length > 1
    );
  } catch {
    return false;
  }
}

const endpoint = z.string().max(2048).refine(bestiePushEndpoint);

export const bestiePushInput = z.discriminatedUnion("enabled", [
  z.object({
    enabled: z.literal(true),
    endpoint,
    keys: z.object({
      p256dh: z.string().regex(/^[\w-]{87}$/),
      auth: z.string().regex(/^[\w-]{22}$/),
    }),
  }),
  z.object({ enabled: z.literal(false), endpoint }),
]);

export function bestiePushConfig() {
  const publicKey = process.env.BESTIE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.BESTIE_VAPID_PRIVATE_KEY;
  const subject = process.env.BESTIE_VAPID_SUBJECT;
  return publicKey && privateKey && subject
    ? { publicKey, privateKey, subject }
    : null;
}
