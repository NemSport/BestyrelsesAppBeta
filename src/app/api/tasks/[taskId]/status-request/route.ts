import { createHmac } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { bestiePath } from "@/lib/bestie";
import { statusReplyHash } from "@/lib/bestie-email-reply";
import { getEmailEnv } from "@/lib/email-env";
import { AppError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { BestieDispatchService } from "@/services/bestie-dispatch-service";

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  requestId: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const taskId = z
      .string()
      .uuid()
      .parse((await params).taskId);
    const { organizationId, requestId } = inputSchema.parse(
      await request.json(),
    );
    const db = await createClient();
    const user = await new AuthService(db).requireUser();
    await new AuthorizationService(db).requireOrganizationAdmin(
      organizationId,
      user.id,
    );

    const secret = process.env.RESEND_BESTIE_WEBHOOK_SECRET;
    const domain = process.env.RESEND_BESTIE_REPLY_DOMAIN;
    const env = getEmailEnv();
    if (
      !secret ||
      !domain ||
      !process.env.RESEND_BESTIE_RECEIVING_KEY ||
      env.EMAIL_DELIVERY_MODE !== "resend"
    ) {
      throw new AppError("Mail til Bestie er endnu ikke sat op.", 503);
    }
    const token = createHmac("sha256", secret)
      .update(`status:${organizationId}:${taskId}:${requestId}`)
      .digest("hex")
      .slice(0, 48);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("bestie_request_task_status", {
      target_org: organizationId,
      target_task: taskId,
      actor: user.id,
      request_key: requestId,
      token_hash: statusReplyHash(token),
    });
    if (error?.code === "22023")
      throw new AppError(
        "Opgaven skal være åben og have en ansvarlig med adgang til at opdatere den.",
        422,
      );
    if (error) throw error;
    const delivery = data[0];
    if (!delivery)
      throw new AppError("Statusrykkeren kunne ikke oprettes.", 502);
    after(async () => {
      try {
        await new BestieDispatchService(admin).sendToThread(delivery.thread_id);
      } catch {
        console.warn("Bestie could not dispatch a status request immediately.");
      }
    });

    const origin =
      process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const conversation = new URL(
      bestiePath(organizationId, delivery.thread_id),
      origin,
    ).href;
    const text = [
      `En administrator har bedt om status på “${delivery.task_title}”. Hvordan går det?`,
      "Svar på denne mail med din status. Dit svar gemmes som en statusnote på opgaven. Du kan også svare til Bestie i appen og godkende forslaget dér.",
      `Åbn samtalen i BestyrelsesMate: ${conversation}`,
    ].join("\n\n");
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": `bestie-status-${requestId}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [delivery.recipient_email],
        subject: `Bestie beder om status: ${delivery.task_title}`,
        text,
        reply_to: `status+${token}@${domain}`,
      }),
      signal: AbortSignal.timeout(9000),
    }).catch(() => null);
    if (!sent?.ok)
      throw new AppError(
        "Mailen kunne ikke sendes. Bestie-beskeden er oprettet. Prøv igen for at sende mailen.",
        502,
      );
    return NextResponse.json({
      message: "Statusrykkeren er sendt som mail og lagt i Bestie.",
    });
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Statusrykkeren kunne ikke sendes.",
    });
  }
}
