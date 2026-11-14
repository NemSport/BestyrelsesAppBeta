import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { test } from "node:test";

import {
  bestieReplyText,
  emailAddress,
  verifyResendSignature,
} from "../../src/lib/bestie-email-reply.ts";

test("inbound webhook accepts only a current signature over the raw request", () => {
  const key = randomBytes(32);
  const secret = `whsec_${key.toString("base64")}`;
  const body = '{"type":"email.received"}';
  const timestamp = "1794618000";
  const signature = createHmac("sha256", key)
    .update(`msg_test.${timestamp}.${body}`)
    .digest("base64");
  const headers = new Headers({
    "svix-id": "msg_test",
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
  });
  assert.equal(
    verifyResendSignature(body, headers, secret, Number(timestamp) * 1000),
    true,
  );
  assert.equal(
    verifyResendSignature(
      body + " ",
      headers,
      secret,
      Number(timestamp) * 1000,
    ),
    false,
  );
  assert.equal(
    verifyResendSignature(
      body,
      headers,
      secret,
      Number(timestamp) * 1000 + 301_000,
    ),
    false,
  );
});

test("extracts only the reply from a quoted Outlook message", () => {
  assert.equal(
    emailAddress("Example <RECIPIENT@example.com>"),
    "recipient@example.com",
  );
  assert.equal(
    bestieReplyText(
      "Jeg har sendt tilbuddet.\r\n\r\n________________________________\r\nFra: Bestie\r\nTidligere tekst",
    ),
    "Jeg har sendt tilbuddet.",
  );
  assert.equal(bestieReplyText("> Tidligere tekst"), "");
});

test("drops the Danish Outlook sign-off and quoted sender line", () => {
  const reply = "Jeg har sendt tilbuddet.\nDer følges op den 27. november.";
  const quote =
    "Den 14. nov. 2026 kl. 01.37 skrev BestyrelsesMate <noreply@example.com>:\n\nTidligere mail";
  assert.equal(bestieReplyText(`${reply}\n\n${quote}`), reply);
  assert.equal(
    bestieReplyText(
      `${reply}\n\nDe bedste hilsner,\nTestbruger\nMobil: 12345678\n\n${quote}`,
    ),
    reply,
  );
});

test("removes the original status email even without a quoted sender line", () => {
  const reply = "Status på aftalen.\nFølg op fredag.";
  assert.equal(
    bestieReplyText(
      `${reply}\n\n\uFEFFEn administrator har bedt om status på “Testopgave”. Hvordan går det?\n\nSvar på denne mail.`,
    ),
    reply,
  );
});
