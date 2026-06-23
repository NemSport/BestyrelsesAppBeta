import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";

import {
  formatDanishDate,
  formatDanishDateTime,
} from "@/lib/date-format";

export type PdfMetaItem = {
  label: string;
  value: string;
};

export type PdfTextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
};

export type PdfProseBlock = {
  type: "paragraph" | "heading" | "listItem" | "quote";
  text: string;
  runs?: PdfTextRun[];
  ordered?: boolean;
  index?: number;
};

export type PdfReportBranding = {
  organizationName?: string;
  logoUrl?: string | null;
  logoBytes?: Uint8Array | null;
  logoMimeType?: "image/png" | "image/jpeg" | null;
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
};

type PdfReportOptions = {
  documentType: string;
  title: string;
  subtitle?: string;
  organizationName?: string;
  committeeName?: string;
  generatedAt?: Date;
  meta?: PdfMetaItem[];
  branding?: PdfReportBranding;
};

type TextOptions = {
  font?: PDFFont;
  size?: number;
  color?: RGB;
  indent?: number;
  gapAfter?: number;
  maxWidth?: number;
  fallback?: string;
  runs?: PdfTextRun[];
};

type TableColumn<T> = {
  label: string;
  width: number;
  getValue: (row: T) => string;
};

const pageSize: [number, number] = [595.28, 841.89];
const margin = 46;
const headerHeight = 86;
const footerHeight = 34;
const palette = {
  ink: rgb(0.09, 0.12, 0.12),
  muted: rgb(0.39, 0.44, 0.42),
  subtle: rgb(0.95, 0.96, 0.94),
  line: rgb(0.78, 0.82, 0.8),
  brand: rgb(0.07, 0.28, 0.24),
  brandSoft: rgb(0.88, 0.94, 0.91),
  warning: rgb(0.72, 0.43, 0.1),
  success: rgb(0.12, 0.42, 0.25),
  danger: rgb(0.62, 0.16, 0.16),
};

function normalizeHexColor(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  return /^[0-9a-fA-F]{6}$/.test(hex) ? hex : null;
}

function rgbFromHex(value: string | null | undefined, fallback: RGB) {
  const hex = normalizeHexColor(value);
  if (!hex) return fallback;
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  );
}

function softRgbFromHex(
  value: string | null | undefined,
  fallback: RGB,
  opacity = 0.25,
) {
  const hex = normalizeHexColor(value);
  if (!hex) return fallback;
  const channels = [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ].map((channel) => (channel * opacity + 255 * (1 - opacity)) / 255);
  return rgb(channels[0], channels[1], channels[2]);
}

function resolvePdfFontNames(fontFamily: string | null | undefined) {
  if (fontFamily === "Courier New") {
    return {
      regular: StandardFonts.Courier,
      bold: StandardFonts.CourierBold,
      italic: StandardFonts.CourierOblique,
      boldItalic: StandardFonts.CourierBoldOblique,
    };
  }

  if (
    fontFamily === "Georgia" ||
    fontFamily === "Merriweather" ||
    fontFamily === "Times New Roman"
  ) {
    return {
      regular: StandardFonts.TimesRoman,
      bold: StandardFonts.TimesRomanBold,
      italic: StandardFonts.TimesRomanItalic,
      boldItalic: StandardFonts.TimesRomanBoldItalic,
    };
  }

  return {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  };
}

async function resolvePdfFonts(
  document: PDFDocument,
  fontFamily: string | null | undefined,
) {
  if (
    fontFamily &&
    fontFamily !== "Courier New" &&
    fontFamily !== "Georgia" &&
    fontFamily !== "Times New Roman"
  ) {
    console.warn(
      `[pdf-report] Brandingfont '${fontFamily}' kan ikke embeddes sikkert i PDF og falder tilbage til en sikker PDF-standardfont.`,
    );
  }

  const fontNames = resolvePdfFontNames(fontFamily);
  return {
    regular: await document.embedFont(fontNames.regular),
    bold: await document.embedFont(fontNames.bold),
    italic: await document.embedFont(fontNames.italic),
    boldItalic: await document.embedFont(fontNames.boldItalic),
  };
}

export function safePdfText(value: string) {
  return value.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

export function formatPdfDate(value: string | Date, withTime = false) {
  return withTime
    ? formatDanishDateTime(value, "long")
    : formatDanishDate(value, "long");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of safePdfText(text).split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        if (line) {
          lines.push(line);
          line = "";
        }

        let chunk = "";
        for (const char of word) {
          const candidate = `${chunk}${char}`;
          if (!chunk || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
            chunk = candidate;
          } else {
            lines.push(chunk);
            chunk = char;
          }
        }
        line = chunk;
        continue;
      }

      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function clampLines(lines: string[], maxLines: number) {
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  visible[visible.length - 1] = `${visible[visible.length - 1].replace(/\.*$/, "")}...`;
  return visible;
}

export async function createPdfReport(options: PdfReportOptions) {
  const document = await PDFDocument.create();
  const { regular, bold, italic, boldItalic } = await resolvePdfFonts(
    document,
    options.branding?.fontFamily,
  );
  const reportPalette = {
    ...palette,
    brand: rgbFromHex(options.branding?.primaryColor, palette.brand),
    brandSoft: softRgbFromHex(options.branding?.primaryColor, palette.brandSoft),
    brandHeader: softRgbFromHex(options.branding?.primaryColor, palette.subtle, 0.22),
    accent: rgbFromHex(options.branding?.accentColor, palette.brand),
  };
  let logoImage: PDFImage | null = null;
  if (options.branding?.logoBytes && options.branding.logoMimeType) {
    try {
      logoImage =
        options.branding.logoMimeType === "image/png"
          ? await document.embedPng(options.branding.logoBytes)
          : await document.embedJpg(options.branding.logoBytes);
    } catch {
      logoImage = null;
    }
  }
  const contentWidth = pageSize[0] - margin * 2;
  let page: PDFPage;
  let y = pageSize[1] - margin - headerHeight;
  let pageNumber = 0;
  let finalized = false;

  const drawHeader = () => {
    page.drawRectangle({
      x: 0,
      y: pageSize[1] - headerHeight,
      width: pageSize[0],
      height: headerHeight,
      color: reportPalette.brandHeader,
    });
    page.drawRectangle({
      x: 0,
      y: pageSize[1] - 4,
      width: pageSize[0],
      height: 4,
      color: reportPalette.brand,
    });
    const logoMaxWidth = 78;
    const logoMaxHeight = 38;
    const textWidth = logoImage ? contentWidth - logoMaxWidth - 18 : contentWidth;
    if (logoImage) {
      const scale = Math.min(
        logoMaxWidth / logoImage.width,
        logoMaxHeight / logoImage.height,
        1,
      );
      const width = logoImage.width * scale;
      const height = logoImage.height * scale;
      page.drawImage(logoImage, {
        x: pageSize[0] - margin - width,
        y: pageSize[1] - 62,
        width,
        height,
      });
    }
    page.drawText(safePdfText(options.documentType.toLocaleUpperCase("da-DK")), {
      x: margin,
      y: pageSize[1] - 32,
      font: bold,
      size: 8.5,
      color: reportPalette.brand,
    });
    const titleLines = clampLines(wrapText(options.title, bold, 14.5, textWidth), 2);
    let titleY = pageSize[1] - 50;
    for (const line of titleLines) {
      page.drawText(line, {
        x: margin,
        y: titleY,
        font: bold,
        size: 14.5,
        color: reportPalette.ink,
      });
      titleY -= 14;
    }
    const context = [
      options.branding?.organizationName ?? options.organizationName,
      options.committeeName,
      options.subtitle,
    ]
      .filter(Boolean)
      .join("  |  ");
    if (context) {
      const contextLines = clampLines(wrapText(context, regular, 8.8, textWidth), 1);
      page.drawText(contextLines[0], {
        x: margin,
        y: pageSize[1] - 76,
        font: regular,
        size: 8.8,
        color: reportPalette.muted,
      });
    }
    page.drawLine({
      start: { x: margin, y: pageSize[1] - headerHeight },
      end: { x: pageSize[0] - margin, y: pageSize[1] - headerHeight },
      thickness: 0.7,
      color: reportPalette.line,
    });
  };

  const drawFooter = () => {
    const generatedAt = options.generatedAt ?? new Date();
    page.drawLine({
      start: { x: margin, y: footerHeight + 8 },
      end: { x: pageSize[0] - margin, y: footerHeight + 8 },
      thickness: 0.5,
      color: reportPalette.line,
    });
    page.drawText(`Eksporteret ${formatPdfDate(generatedAt)}`, {
      x: margin,
      y: footerHeight - 7,
      font: regular,
      size: 8,
      color: reportPalette.muted,
    });
    page.drawText(`Side ${pageNumber}`, {
      x: pageSize[0] - margin - 36,
      y: footerHeight - 7,
      font: regular,
      size: 8,
      color: reportPalette.muted,
    });
  };

  const newPage = () => {
    if (pageNumber > 0) drawFooter();
    page = document.addPage(pageSize);
    pageNumber += 1;
    y = pageSize[1] - margin - headerHeight;
    drawHeader();
  };

  const ensureSpace = (height: number) => {
    if (y - height < footerHeight + margin) {
      newPage();
      return true;
    }
    return false;
  };

  const fontForRun = (run: PdfTextRun) => {
    if (run.bold && run.italic) return boldItalic;
    if (run.bold) return bold;
    if (run.italic) return italic;
    return regular;
  };

  const mergeRun = (runs: PdfTextRun[], run: PdfTextRun) => {
    const text = safePdfText(run.text);
    if (!text) return;
    const next: PdfTextRun = {
      text,
      bold: run.bold || undefined,
      italic: run.italic || undefined,
    };
    const last = runs[runs.length - 1];
    if (last && last.bold === next.bold && last.italic === next.italic) {
      last.text += next.text;
      return;
    }
    runs.push(next);
  };

  const runLineWidth = (runs: PdfTextRun[], size: number) =>
    runs.reduce(
      (width, run) => width + fontForRun(run).widthOfTextAtSize(run.text, size),
      0,
    );

  const wrapRuns = (runs: PdfTextRun[], size: number, maxWidth: number) => {
    const lines: PdfTextRun[][] = [];
    let line: PdfTextRun[] = [];

    const pushLine = () => {
      lines.push(line.length ? line : [{ text: "" }]);
      line = [];
    };

    const appendToken = (token: string, source: PdfTextRun) => {
      if (token === "\n") {
        pushLine();
        return;
      }
      const text = token.replace(/\s+/g, " ");
      if (!text.trim() && !line.length) return;
      const candidate = [...line];
      mergeRun(candidate, { ...source, text });
      if (!line.length || runLineWidth(candidate, size) <= maxWidth) {
        line = candidate;
        return;
      }
      pushLine();
      const trimmed = text.trimStart();
      if (fontForRun(source).widthOfTextAtSize(trimmed, size) <= maxWidth) {
        mergeRun(line, { ...source, text: trimmed });
        return;
      }

      let chunk = "";
      for (const char of trimmed) {
        const candidateChunk = `${chunk}${char}`;
        if (
          !chunk ||
          fontForRun(source).widthOfTextAtSize(candidateChunk, size) <= maxWidth
        ) {
          chunk = candidateChunk;
        } else {
          mergeRun(line, { ...source, text: chunk });
          pushLine();
          chunk = char;
        }
      }
      if (chunk) mergeRun(line, { ...source, text: chunk });
    };

    for (const run of runs.length ? runs : [{ text: "" }]) {
      for (const token of safePdfText(run.text).split(/(\n|\s+)/).filter(Boolean)) {
        appendToken(token, run);
      }
    }
    if (line.length || !lines.length) pushLine();
    return lines;
  };

  const drawRunLine = (
    runs: PdfTextRun[],
    x: number,
    lineY: number,
    size: number,
    color: RGB,
  ) => {
    let cursor = x;
    for (const run of runs) {
      const font = fontForRun(run);
      page.drawText(run.text, {
        x: cursor,
        y: lineY,
        font,
        size,
        color,
      });
      cursor += font.widthOfTextAtSize(run.text, size);
    }
  };

  const addText = (text: string, textOptions: TextOptions = {}) => {
    const font = textOptions.font ?? regular;
    const size = textOptions.size ?? 10;
    const indent = textOptions.indent ?? 0;
    const lineHeight = size * 1.35;
    const fallback = textOptions.fallback ?? "Ikke angivet";
    const lines = wrapText(
      text.trim() || fallback,
      font,
      size,
      textOptions.maxWidth ?? contentWidth - indent,
    );
    ensureSpace(lines.length * lineHeight + (textOptions.gapAfter ?? 0));
    for (const line of lines) {
      page.drawText(line, {
        x: margin + indent,
        y,
        font,
        size,
        color: textOptions.color ?? reportPalette.ink,
      });
      y -= lineHeight;
    }
    y -= textOptions.gapAfter ?? 0;
  };

  const addParagraph = (text: string, textOptions: TextOptions = {}) => {
    addText(text, { size: 10.2, gapAfter: 8, ...textOptions });
  };

  const addProse = (blocks: PdfProseBlock[], emptyText = "Ikke angivet") => {
    if (!blocks.length) {
      addParagraph(emptyText);
      return;
    }

    const addProseLine = (
      text: string,
      options: TextOptions & { bullet?: string } = {},
    ) => {
      const font = options.font ?? regular;
      const size = options.size ?? 10.2;
      const indent = options.indent ?? 0;
      const bulletWidth = options.bullet ? 18 : 0;
      const lineHeight = size * 1.48;
      const maxWidth = options.maxWidth ?? contentWidth - indent - bulletWidth;
      const lines = options.runs?.length
        ? wrapRuns(options.runs, size, maxWidth)
        : wrapText(text, font, size, maxWidth).map((line) => [{ text: line }]);
      ensureSpace(lines.length * lineHeight + (options.gapAfter ?? 0));
      if (options.bullet) {
        page.drawText(safePdfText(options.bullet), {
          x: margin + indent,
          y,
          font: bold,
          size,
          color: options.color ?? reportPalette.ink,
        });
      }
      for (const [index, line] of lines.entries()) {
        if (options.runs?.length) {
          drawRunLine(
            line,
            margin + indent + bulletWidth,
            y,
            size,
            options.color ?? reportPalette.ink,
          );
        } else {
          page.drawText(line[0]?.text ?? "", {
            x: margin + indent + bulletWidth,
            y,
            font,
            size,
            color: options.color ?? reportPalette.ink,
          });
        }
        y -= lineHeight;
        if (index === 0 && options.bullet) {
          // Subsequent wrapped lines align with the text, not the marker.
        }
      }
      y -= options.gapAfter ?? 0;
    };

    for (const block of blocks) {
      if (block.type === "heading") {
        addSubsection(block.text);
        continue;
      }

      if (block.type === "listItem") {
        addProseLine(block.text, {
          bullet: block.ordered ? `${block.index ?? 1}.` : "-",
          indent: 12,
          gapAfter: 5,
          runs: block.runs,
        });
        continue;
      }

      if (block.type === "quote") {
        ensureSpace(30);
        page.drawRectangle({
          x: margin,
          y: y - 5,
          width: 3,
          height: 18,
          color: reportPalette.line,
        });
        addProseLine(block.text, {
          color: reportPalette.muted,
          indent: 12,
          gapAfter: 9,
          runs: block.runs,
        });
        continue;
      }

      const lines = block.text.split(/\n+/).filter(Boolean);
      const looksLikeSubPoints =
        lines.length > 1 &&
        lines.some((line) => /^[a-zæøå0-9][.)]\s+/i.test(line.trim()));
      if (looksLikeSubPoints) {
        for (const line of lines) {
          const match = line.trim().match(/^([a-zæøå0-9][.)])\s+(.*)$/i);
          if (match) {
            addProseLine(match[2], {
              bullet: match[1],
              indent: 12,
              gapAfter: 5,
            });
          } else {
            addProseLine(line, { gapAfter: 5 });
          }
        }
        y -= 3;
      } else {
        addProseLine(block.text, { gapAfter: 10, runs: block.runs });
      }
    }
  };

  const addSection = (title: string) => {
    ensureSpace(46);
    y -= 10;
    page.drawRectangle({
      x: margin,
      y: y - 6,
      width: 4,
      height: 18,
      color: reportPalette.brand,
    });
    page.drawText(safePdfText(title), {
      x: margin + 12,
      y,
      font: bold,
      size: 13,
      color: reportPalette.brand,
    });
    y -= 18;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageSize[0] - margin, y },
      thickness: 0.5,
      color: reportPalette.line,
    });
    y -= 12;
  };

  const addSubsection = (title: string) => {
    ensureSpace(24);
    page.drawText(safePdfText(title), {
      x: margin,
      y,
      font: bold,
      size: 10.5,
      color: reportPalette.ink,
    });
    y -= 15;
  };

  const addAgendaItemHeader = (input: {
    number: number;
    typeLabel: string;
    title: string;
    subtitle?: string;
  }) => {
    const title = `${input.number}. (${input.typeLabel}) ${input.title}`;
    const titleLines = wrapText(title, bold, 11.2, contentWidth - 22);
    const subtitleLines = input.subtitle
      ? clampLines(wrapText(input.subtitle, regular, 8.6, contentWidth - 22), 2)
      : [];
    const boxHeight = 22 + titleLines.length * 13 + subtitleLines.length * 11;
    ensureSpace(boxHeight + 12);
    y -= 2;
    page.drawRectangle({
      x: margin,
      y: y - boxHeight + 10,
      width: contentWidth,
      height: boxHeight,
      color: reportPalette.brandSoft,
      borderColor: reportPalette.line,
      borderWidth: 0.45,
    });
    page.drawRectangle({
      x: margin,
      y: y - boxHeight + 10,
      width: 3,
      height: boxHeight,
      color: reportPalette.brand,
    });
    let localY = y - 8;
    for (const line of titleLines) {
      page.drawText(line, {
        x: margin + 12,
        y: localY,
        font: bold,
        size: 11.2,
        color: reportPalette.ink,
      });
      localY -= 13;
    }
    for (const line of subtitleLines) {
      page.drawText(line, {
        x: margin + 12,
        y: localY,
        font: regular,
        size: 8.6,
        color: reportPalette.muted,
      });
      localY -= 11;
    }
    y -= boxHeight + 6;
  };

  const addMetaGrid = (items: PdfMetaItem[]) => {
    const visible = items.filter((item) => item.value);
    if (!visible.length) return;
    const columnWidth = contentWidth / 2 - 8;
    for (let index = 0; index < visible.length; index += 2) {
      const row = visible.slice(index, index + 2);
      const prepared = row.map((item) => ({
        item,
        valueLines: clampLines(
          wrapText(item.value, regular, 8.8, columnWidth - 16),
          3,
        ),
      }));
      const rowHeight = Math.max(
        36,
        Math.max(...prepared.map((item) => item.valueLines.length)) * 10.5 + 21,
      );
      ensureSpace(rowHeight + 8);
      row.forEach((item, column) => {
        const valueLines = prepared[column].valueLines;
        const x = margin + column * (columnWidth + 16);
        page.drawRectangle({
          x,
          y: y - rowHeight + 7,
          width: columnWidth,
          height: rowHeight,
          color: reportPalette.subtle,
        });
        page.drawText(safePdfText(item.label.toLocaleUpperCase("da-DK")), {
          x: x + 8,
          y: y - 2,
          font: bold,
          size: 7,
          color: reportPalette.muted,
        });
        let valueY = y - 16;
        for (const line of valueLines) {
          page.drawText(line, {
            x: x + 8,
            y: valueY,
            font: regular,
            size: 8.8,
            color: reportPalette.ink,
          });
          valueY -= 10.5;
        }
      });
      y -= rowHeight;
    }
    y -= 8;
  };

  const addKeyValue = (label: string, value: string) => {
    addSubsection(label);
    addParagraph(value);
  };

  const addBadge = (
    label: string,
    tone: "neutral" | "success" | "warning" | "danger" = "neutral",
  ) => {
    const colors = {
      neutral: { fill: reportPalette.subtle, text: reportPalette.ink },
      success: { fill: rgb(0.88, 0.95, 0.9), text: reportPalette.success },
      warning: { fill: rgb(0.98, 0.93, 0.84), text: reportPalette.warning },
      danger: { fill: rgb(0.97, 0.88, 0.88), text: reportPalette.danger },
    }[tone];
    const width = Math.min(
      Math.max(bold.widthOfTextAtSize(label, 8) + 16, 48),
      contentWidth,
    );
    ensureSpace(19);
    page.drawRectangle({
      x: margin,
      y: y - 7,
      width,
      height: 16,
      color: colors.fill,
      borderColor: reportPalette.line,
      borderWidth: 0.3,
    });
    page.drawText(safePdfText(label), {
      x: margin + 8,
      y: y - 3,
      font: bold,
      size: 8,
      color: colors.text,
    });
    y -= 24;
  };

  const addTable = <T>(columns: TableColumn<T>[], rows: T[], emptyText: string) => {
    if (!rows.length) {
      addParagraph(emptyText);
      return;
    }

    const headerHeight = 22;
    const lineHeight = 12;
    const maxCellLines = 6;
    let shouldDrawHeader = true;
    const drawTableHeader = () => {
      page.drawRectangle({
        x: margin,
        y: y - 15,
        width: contentWidth,
        height: headerHeight,
        color: reportPalette.brandSoft,
      });
      let headerX = margin;
      for (const column of columns) {
        page.drawText(safePdfText(column.label), {
          x: headerX + 6,
          y: y - 8,
          font: bold,
          size: 8,
          color: reportPalette.brand,
        });
        headerX += column.width;
      }
      y -= headerHeight;
      shouldDrawHeader = false;
    };

    const usablePageHeight = pageSize[1] - headerHeight - footerHeight - margin * 2;
    for (const row of rows) {
      const cells = columns.map((column) =>
        clampLines(
          wrapText(column.getValue(row) || "-", regular, 8.5, column.width - 10),
          maxCellLines,
        ),
      );
      const rowHeight =
        Math.min(
          usablePageHeight - headerHeight - 18,
          Math.max(26, Math.max(...cells.map((cell) => cell.length)) * lineHeight + 12),
        );
      const startedNewPage = ensureSpace(
        (shouldDrawHeader ? headerHeight : 0) + rowHeight + 12,
      );
      if (startedNewPage) shouldDrawHeader = true;

      if (shouldDrawHeader) drawTableHeader();

      page.drawRectangle({
        x: margin,
        y: y - rowHeight + 4,
        width: contentWidth,
        height: rowHeight,
        color: rgb(1, 1, 1),
        borderColor: reportPalette.line,
        borderWidth: 0.35,
      });
      let cellX = margin;
      cells.forEach((cellLines, index) => {
        let cellY = y - 9;
        for (const line of cellLines) {
          page.drawText(line, {
            x: cellX + 6,
            y: cellY,
            font: regular,
            size: 8.5,
            color: reportPalette.ink,
          });
          cellY -= lineHeight;
        }
        cellX += columns[index].width;
      });
      y -= rowHeight;
    }
    y -= 8;
  };

  const save = async () => {
    if (!finalized) {
      drawFooter();
      finalized = true;
    }
    return document.save();
  };

  newPage();
  addMetaGrid(options.meta ?? []);

  return {
    document,
    fonts: { regular, bold, italic, boldItalic },
    palette: reportPalette,
    addAgendaItemHeader,
    addBadge,
    addKeyValue,
    addMetaGrid,
    addParagraph,
    addProse,
    addSection,
    addSubsection,
    addTable,
    addText,
    save,
  };
}
