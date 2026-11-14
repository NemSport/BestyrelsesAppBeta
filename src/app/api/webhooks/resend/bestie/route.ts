import { after, NextResponse } from "next/server";
import { z } from "zod";

import {
  bestieReplyText,
  emailAddress,
  statusReplyHash,
  verifyResendSignature,
} from "@/lib/bestie-email-reply";
import { richTextToPlainText } from "@/lib/rich-text";
import { createAdminClient } from "@/lib/supabase/admin";
import { BestieDispatchService } from "@/services/bestie-dispatch-service";

const eventSchema = z.object({
  type: z.literal("email.received"),
  data: z.object({ email_id: z.string().uuid(), to: z.array(z.string()) }),
});
const receivedSchema = z.object({
  from: z.string(),
  to: z.array(z.string()),
  text: z.string().nullish(),
  html: z.string().nullish(),
  authentication: z.object({ dmarc: z.string() }),
  headers: z.record(z.unknown()).nullish(),
});

export async function POST(request: Request) {
  const secret = process.env.RESEND_BESTIE_WEBHOOK_SECRET;
  const domain = process.env.RESEND_BESTIE_REPLY_DOMAIN?.toLowerCase();
  const key = process.env.RESEND_BESTIE_RECEIVING_KEY;
  if (!secret || !domain || !key)
    return new NextResponse(null, { status: 503 });
  const body = await request.text();
  if (
    body.length > 250_000 ||
    !verifyResendSignature(body, request.headers, secret)
  ) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    const event = eventSchema.safeParse(JSON.parse(body));
    if (!event.success) return new NextResponse(null, { status: 204 });
    const { email_id: emailId, to } = event.data.data;
    const addresses = to
      .map(emailAddress)
      .filter((address) => address.endsWith(`@${domain}`));
    if (addresses.length !== 1) return new NextResponse(null, { status: 204 });
    const token = addresses[0].match(/^status\+([a-f\d]{48})@/)?.[1];
    if (!token) return new NextResponse(null, { status: 204 });

    const received = await fetch(
      `https://api.resend.com/emails/receiving/${emailId}?html_format=cid`,
      {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!received.ok) return new NextResponse(null, { status: 502 });
    const email = receivedSchema.safeParse(await received.json());
    if (
      !email.success ||
      email.data.authentication.dmarc !== "pass" ||
      !email.data.to.map(emailAddress).includes(addresses[0])
    )
      return new NextResponse(null, { status: 204 });
    const auto = Object.entries(email.data.headers ?? {}).find(
      ([name]) => name.toLowerCase() === "auto-submitted",
    )?.[1];
    if (typeof auto === "string" && auto.toLowerCase().trim() !== "no")
      return new NextResponse(null, { status: 204 });
    const text = bestieReplyText(
      email.data.text ||
        richTextToPlainText(email.data.html?.split(/<blockquote\b/i)[0]),
    );
    if (!text) return new NextResponse(null, { status: 204 });

    const db = createAdminClient();
    const { data: threadId, error } = await db.rpc(
      "bestie_receive_task_status",
      {
        token_hash: statusReplyHash(token),
        sender: emailAddress(email.data.from),
        inbound_id: emailId,
        reply_text: text,
      },
    );
    if (error) throw error;
    if (threadId)
      after(async () => {
        try {
          await new BestieDispatchService(db).sendToThread(threadId);
        } catch {
          console.warn(
            "Bestie could not dispatch a mail reply notification immediately.",
          );
        }
      });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
