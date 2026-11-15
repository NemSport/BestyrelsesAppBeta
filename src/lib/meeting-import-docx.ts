import { Open } from "unzipper-esm";

const maxXmlBytes = 2_000_000;
const maxTextLength = 50_000;

function decodeXml(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
  };
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (match, entity: string) => {
      if (entity in named) return named[entity];
      const code = /^#x/i.test(entity)
        ? Number.parseInt(entity.slice(2), 16)
        : Number(entity.slice(1));
      return Number.isInteger(code) &&
        code > 0 &&
        code <= 0x10ffff &&
        !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : match;
    },
  );
}

export async function extractMeetingDocx(bytes: Buffer) {
  const archive = await Open.buffer(bytes);
  const document = archive.files.find(
    ({ path }) => path === "word/document.xml",
  );
  if (!document || document.uncompressedSize > maxXmlBytes)
    throw new Error("Ugyldig Word-fil.");
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of document.stream()) {
    length += chunk.length;
    if (length > maxXmlBytes) throw new Error("Word-filen er for stor.");
    chunks.push(chunk);
  }

  const xml = Buffer.concat(chunks).toString("utf8");
  const tokens = xml.matchAll(
    /<w:t(?:\s[^<>]*)?>([^<]*)<\/w:t>|<w:(tab|br)(?:\s[^<>]*)?\s*\/>|<\/w:p>/g,
  );
  const paragraphs: string[] = [];
  let line: string[] = [];
  for (const [tag, value, separator] of tokens) {
    if (tag === "</w:p>") {
      paragraphs.push(line.join("").trim());
      line = [];
    } else {
      line.push(
        separator === "tab"
          ? "\t"
          : separator === "br"
            ? "\n"
            : decodeXml(value),
      );
    }
  }
  const result = paragraphs.filter(Boolean).join("\n");
  if (!result || result.length > maxTextLength)
    throw new Error(
      "Word-filen skal indeholde højst 50.000 tegn som almindelig tekst.",
    );
  return result;
}
