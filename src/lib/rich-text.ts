const allowedTags = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "ul",
  "ol",
  "li",
  "a",
  "div",
  "h2",
  "blockquote",
  "u",
]);

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeHtmlEntities(value: string) {
  const decodeCodePoint = (code: number) =>
    Number.isInteger(code) && code >= 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : "\uFFFD";

  return value
    .replace(/&#(\d+);/g, (_, code: string) =>
      decodeCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      decodeCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function safeHref(value: string) {
  const href = decodeHtmlEntities(value).trim();
  return /^(https?:\/\/|mailto:)/i.test(href) ? href : null;
}

function sanitizeTag(token: string) {
  const match = token.match(/^<\s*(\/?)\s*([a-z0-9]+)([^>]*)>$/i);
  if (!match) return "";

  const [, closing, rawTag, attributes] = match;
  const tag = rawTag.toLowerCase();
  if (!allowedTags.has(tag)) return "";

  const normalizedTag =
    tag === "b" ? "strong" : tag === "i" ? "em" : tag === "div" ? "p" : tag;
  if (closing) return normalizedTag === "br" ? "" : `</${normalizedTag}>`;
  if (normalizedTag === "br") return "<br>";

  if (normalizedTag === "a") {
    const hrefMatch = attributes.match(
      /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
    );
    const href = safeHref(
      hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "",
    );
    if (!href) return "";
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`;
  }

  return `<${normalizedTag}>`;
}

export function plainTextToRichText(value: string) {
  if (!value) return "";
  return `<p>${escapeHtml(value).replace(/\r?\n/g, "<br>")}</p>`;
}

export function sanitizeRichText(value: string | null | undefined) {
  if (!value) return "";

  const hasHtml =
    /<\/?(?:p|br|strong|b|em|i|ul|ol|li|a|div|h2|blockquote|u)\b/i.test(
      value,
    );
  if (!hasHtml) return plainTextToRichText(value);

  const sanitized = (value.match(/<[^>]*>|[^<]+/g) ?? [])
    .map((token) =>
      token.startsWith("<")
        ? sanitizeTag(token)
        : escapeHtml(decodeHtmlEntities(token)),
    )
    .join("")
    .trim();
  return richTextToPlainText(sanitized) ? sanitized : "";
}

export function richTextToPlainText(value: string | null | undefined) {
  if (!value) return "";
  const normalized = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h2|blockquote)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]*>/g, "");

  return decodeHtmlEntities(normalized)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function firstRichTextToPlainText(
  ...values: Array<string | null | undefined>
) {
  for (const value of values) {
    const plainText = richTextToPlainText(value);
    if (plainText) return plainText;
  }
  return "";
}

export function isRichTextEmpty(value: string | null | undefined) {
  return richTextToPlainText(value).length === 0;
}
