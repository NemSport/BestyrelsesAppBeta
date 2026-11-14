import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function statusReplyHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyResendSignature(
  body: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
) {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (
    !id ||
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    !signatures ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !secret.startsWith("whsec_")
  )
    return false;

  const key = Buffer.from(secret.slice(6), "base64");
  if (key.length < 16) return false;
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest();
  return signatures.split(" ").some((signature) => {
    const [version, value] = signature.split(",");
    if (version !== "v1" || !value) return false;
    const actual = Buffer.from(value, "base64");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  });
}

export function emailAddress(value: string) {
  const trimmed = value.trim().toLowerCase();
  return trimmed.match(/<([^<>]+)>$/)?.[1]?.trim() ?? trimmed;
}

export function bestieReplyText(text: string) {
  const lines = text
    .replace(/\uFEFF/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const quotedHeader = /(?:wrote|skrev)(?:\s+[^:]{1,140})?:\s*$/i;
  const boundary = lines.findIndex(
    (line, index) =>
      /^\s*(?:>|--\s*$|_{5,}|-{2,}\s*(?:original message|oprindelig meddelelse)|fra:|from:|sent:|sendt:|en administrator har bedt om status på [“"])/i.test(
        line,
      ) ||
      (/^\s*(?:on|den)\s/i.test(line) &&
        (quotedHeader.test(line) || quotedHeader.test(lines[index + 1] ?? ""))),
  );
  const reply = lines.slice(0, boundary < 0 ? lines.length : boundary);
  const signoff = reply.findIndex(
    (line, index) =>
      index > 0 &&
      !reply[index - 1].trim() &&
      /^\s*(?:med venlig hilsen|de bedste hilsner|venlig hilsen|mvh\.?|best regards|kind regards|sent from my iphone|sendt fra min iphone)[,.!]?\s*$/i.test(
        line,
      ) &&
      reply.slice(index + 1).filter((part) => part.trim()).length <= 6,
  );
  return reply
    .slice(0, signoff < 0 ? reply.length : signoff)
    .join("\n")
    .trim()
    .slice(0, 1500);
}
