import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  PDFDocument,
  PDFFont,
  PDFPage,
  PDFPageDrawTextOptions,
} from "pdf-lib";

const FONT_DIRECTORY = path.join(process.cwd(), "public", "fonts");

const fontFiles = {
  regular: "NotoSans-Regular.ttf",
  bold: "NotoSans-Bold.ttf",
  italic: "NotoSans-Italic.ttf",
  boldItalic: "NotoSans-BoldItalic.ttf",
  symbols: "NotoSansSymbols2-Regular.ttf",
  emoji: "NotoEmoji-Variable.ttf",
} as const;

let fontBytesPromise:
  | Promise<Record<keyof typeof fontFiles, Uint8Array>>
  | undefined;

function loadFontBytes() {
  fontBytesPromise ??= Promise.all(
    Object.entries(fontFiles).map(async ([style, fileName]) => [
      style,
      new Uint8Array(await readFile(path.join(FONT_DIRECTORY, fileName))),
    ]),
  ).then(
    (entries) =>
      Object.fromEntries(entries) as Record<keyof typeof fontFiles, Uint8Array>,
  );
  return fontBytesPromise;
}

export async function embedPdfFonts(document: PDFDocument) {
  document.registerFontkit(fontkit);
  const bytes = await loadFontBytes();
  const [regular, bold, italic, boldItalic, symbols, emoji] = await Promise.all(
    [
      document.embedFont(bytes.regular, { subset: true }),
      document.embedFont(bytes.bold, { subset: true }),
      document.embedFont(bytes.italic, { subset: true }),
      document.embedFont(bytes.boldItalic, { subset: true }),
      document.embedFont(bytes.symbols, { subset: true }),
      document.embedFont(bytes.emoji, { subset: true }),
    ],
  );
  const primaryCodePoints = new Set(fontkit.create(bytes.regular).characterSet);
  const symbolCodePoints = new Set(fontkit.create(bytes.symbols).characterSet);
  const emojiCodePoints = new Set(fontkit.create(bytes.emoji).characterSet);
  const primaryFonts = new Set([regular, bold, italic, boldItalic]);
  const originalWidths = new Map<
    PDFFont,
    (text: string, size: number) => number
  >();
  for (const font of [...primaryFonts, symbols, emoji]) {
    originalWidths.set(font, font.widthOfTextAtSize.bind(font));
  }

  const fontForCharacter = (primary: PDFFont, character: string) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (primaryCodePoints.has(codePoint)) return primary;
    if (symbolCodePoints.has(codePoint)) return symbols;
    if (emojiCodePoints.has(codePoint)) return emoji;
    return primary;
  };

  const segments = (text: string, primary: PDFFont) => {
    const result: Array<{ font: PDFFont; text: string }> = [];
    for (const character of text) {
      // Variation selectors choose an emoji presentation but have no visible
      // glyph of their own in the monochrome PDF fallback font.
      if (character === "\uFE0E" || character === "\uFE0F") continue;
      const font = fontForCharacter(primary, character);
      const last = result.at(-1);
      if (last?.font === font) last.text += character;
      else result.push({ font, text: character });
    }
    return result;
  };

  const widthOfTextAtSize = (text: string, size: number, primary: PDFFont) =>
    segments(text, primary).reduce(
      (width, segment) =>
        width + (originalWidths.get(segment.font)?.(segment.text, size) ?? 0),
      0,
    );

  for (const font of primaryFonts) {
    font.widthOfTextAtSize = (text, size) =>
      widthOfTextAtSize(text, size, font);
  }

  const drawText = (
    page: PDFPage,
    text: string,
    options: PDFPageDrawTextOptions,
  ) => {
    const primary = options.font ?? regular;
    const size = options.size ?? 12;
    let x = options.x ?? 0;
    for (const segment of segments(text, primary)) {
      page.drawText(segment.text, { ...options, x, font: segment.font });
      x += originalWidths.get(segment.font)?.(segment.text, size) ?? 0;
    }
  };

  return {
    regular,
    bold,
    italic,
    boldItalic,
    symbols,
    emoji,
    drawText,
    widthOfTextAtSize,
  };
}
