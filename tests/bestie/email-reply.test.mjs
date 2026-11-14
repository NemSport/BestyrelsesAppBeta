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
