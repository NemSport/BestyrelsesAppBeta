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

export type RichTextPdfRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
};

export type RichTextPdfBlock = {
  type: "paragraph" | "heading" | "listItem" | "quote";
  text: string;
  runs?: RichTextPdfRun[];
  ordered?: boolean;
  index?: number;
};

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

function mergeRun(
  runs: RichTextPdfRun[],
  text: string,
  style: Pick<RichTextPdfRun, "bold" | "italic">,
) {
  if (!text) return;
  const next: RichTextPdfRun = {
    text,
    bold: style.bold || undefined,
    italic: style.italic || undefined,
  };
  const last = runs[runs.length - 1];
  if (last && last.bold === next.bold && last.italic === next.italic) {
    last.text += next.text;
    return;
  }
  runs.push(next);
}

function normalizeRuns(runs: RichTextPdfRun[]) {
  const normalized: RichTextPdfRun[] = [];
  for (const run of runs) {
    mergeRun(normalized, run.text.replace(/[ \t]+/g, " "), run);
  }

  while (normalized.length && !normalized[0].text.trim()) normalized.shift();
  while (normalized.length && !normalized[normalized.length - 1].text.trim()) {
    normalized.pop();
  }
  if (normalized.length) {
    normalized[0].text = normalized[0].text.replace(/^\s+/, "");
    const last = normalized[normalized.length - 1];
    last.text = last.text.replace(/\s+$/, "");
  }

  return normalized.filter((run) => run.text);
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

export function richTextToPdfBlocks(value: string | null | undefined) {
  const sanitized = sanitizeRichText(value);
  if (!sanitized) return [] satisfies RichTextPdfBlock[];

  const blocks: RichTextPdfBlock[] = [];
  const listStack: Array<"ul" | "ol"> = [];
  const listCounters: number[] = [];
  let active: RichTextPdfBlock["type"] | null = null;
  let buffer = "";
  let runs: RichTextPdfRun[] = [];
  let boldDepth = 0;
  let italicDepth = 0;

  const currentStyle = () => ({
    bold: boldDepth > 0,
    italic: italicDepth > 0,
  });

  const pushBuffer = () => {
    const normalizedRuns = normalizeRuns(runs);
    const text = decodeHtmlEntities(buffer)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text) {
      buffer = "";
      runs = [];
      return;
    }
    if (active === "listItem") {
      const ordered = listStack[listStack.length - 1] === "ol";
      const counterIndex = Math.max(listCounters.length - 1, 0);
      if (ordered) listCounters[counterIndex] += 1;
      blocks.push({
        type: "listItem",
        text,
        runs: normalizedRuns,
        ordered,
        index: ordered ? listCounters[counterIndex] : undefined,
      });
    } else {
      blocks.push({
        type: active ?? "paragraph",
        text,
        runs: normalizedRuns,
      });
    }
    buffer = "";
    runs = [];
  };

  for (const token of sanitized.match(/<[^>]*>|[^<]+/g) ?? []) {
    if (!token.startsWith("<")) {
      const decoded = decodeHtmlEntities(token);
      buffer += decoded;
      mergeRun(runs, decoded, currentStyle());
      continue;
    }

    const tagMatch = token.match(/^<\s*(\/?)\s*([a-z0-9]+)[^>]*>$/i);
    if (!tagMatch) continue;
    const [, closing, rawTag] = tagMatch;
    const tag = rawTag.toLowerCase();

    if (tag === "br" && !closing) {
      buffer += "\n";
      mergeRun(runs, "\n", currentStyle());
      continue;
    }

    if (!closing && tag === "strong") {
      boldDepth += 1;
      continue;
    }

    if (closing && tag === "strong") {
      boldDepth = Math.max(0, boldDepth - 1);
      continue;
    }

    if (!closing && tag === "em") {
      italicDepth += 1;
      continue;
    }

    if (closing && tag === "em") {
      italicDepth = Math.max(0, italicDepth - 1);
      continue;
    }

    if (!closing && (tag === "p" || tag === "h2" || tag === "blockquote" || tag === "li")) {
      pushBuffer();
      active =
        tag === "h2" ? "heading" : tag === "blockquote" ? "quote" : tag === "li" ? "listItem" : "paragraph";
      continue;
    }

    if (closing && (tag === "p" || tag === "h2" || tag === "blockquote" || tag === "li")) {
      pushBuffer();
      active = null;
      continue;
    }

    if (!closing && (tag === "ul" || tag === "ol")) {
      listStack.push(tag);
      listCounters.push(0);
      continue;
    }

    if (closing && (tag === "ul" || tag === "ol")) {
      pushBuffer();
      listStack.pop();
      listCounters.pop();
    }
  }

  pushBuffer();
  return blocks;
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
