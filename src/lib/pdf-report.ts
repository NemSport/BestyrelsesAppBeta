import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";

import { formatDanishDate, formatDanishDateTime } from "@/lib/date-format";
import { embedPdfFonts } from "@/lib/pdf-fonts";
import { resolvePdfTheme, type PdfReportBranding } from "@/lib/pdf-theme";

export type { PdfReportBranding } from "@/lib/pdf-theme";

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

export type PdfReportAttachment = {
  appendixNumber: number;
  pointLabel: string;
  fileName: string;
  mimeType: string;
  bytes?: Uint8Array | null;
  embedType: "pdf" | "png" | "jpg" | "unsupported";
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
  orientation?: "portrait" | "landscape";
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

export type PdfTableBadgeTone =
  | "neutral"
  | "progress"
  | "warning"
  | "orange"
  | "success"
  | "danger";

type PdfTableBadge = {
  label: string;
  tone: PdfTableBadgeTone;
};

type TableColumn<T> = {
  label: string;
  width: number;
  getValue: (row: T) => string;
  getBadge?: (row: T) => PdfTableBadge | null;
};

type TableOptions = {
  keepRowsTogether?: boolean;
  minimumContinuationLines?: number;
};

type AgendaItemCardInput = {
  number: number;
  typeLabel: string;
  title: string;
  subtitle?: string;
};

const portraitPageSize: [number, number] = [595.28, 841.89];
const margin = 46;
const footerHeight = 34;
export function safePdfText(value: string) {
  return value
    .normalize("NFC")
    .replace(/\t/g, "    ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "�");
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

export async function createPdfReport(options: PdfReportOptions) {
  const pageSize: [number, number] =
    options.orientation === "landscape"
      ? [portraitPageSize[1], portraitPageSize[0]]
      : portraitPageSize;
  const document = await PDFDocument.create();
  const { regular, bold, italic, boldItalic, drawText } =
    await embedPdfFonts(document);
  const generatedAt = options.generatedAt ?? new Date();
  document.setCreationDate(generatedAt);
  document.setModificationDate(generatedAt);
  document.setCreator("BestyrelsesApp");
  document.setProducer("BestyrelsesApp PDF export");
  document.setTitle(safePdfText(options.title));
  const reportPalette = resolvePdfTheme(options.branding);
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
  const headerTextWidth = logoImage ? contentWidth - 96 : contentWidth;
  const titleLines = wrapText(options.title, bold, 14.5, headerTextWidth);
  const context = [
    options.branding?.organizationName ?? options.organizationName,
    options.committeeName,
    options.subtitle,
  ]
    .filter(Boolean)
    .join("  |  ");
  const contextLines = context
    ? wrapText(context, regular, 8.8, headerTextWidth)
    : [];
  const reportHeaderHeight = Math.max(
    86,
    43 + titleLines.length * 16 + contextLines.length * 11,
  );
  let page: PDFPage;
  let y = pageSize[1] - margin - reportHeaderHeight;
  let pageNumber = 0;
  let finalized = false;
  let activeCard:
    | (AgendaItemCardInput & { startPageIndex: number; startY: number })
    | null = null;
  let activeInformationBox: {
    title: string;
    startPageIndex: number;
    startY: number;
  } | null = null;

  const contentTop = () => pageSize[1] - margin - reportHeaderHeight;
  const flowInset = () =>
    (activeCard ? 12 : 0) + (activeInformationBox ? 12 : 0);
  const flowX = () => margin + flowInset();
  const flowWidth = () => contentWidth - flowInset() * 2;

  const drawHeader = () => {
    page.drawRectangle({
      x: 0,
      y: pageSize[1] - reportHeaderHeight,
      width: pageSize[0],
      height: reportHeaderHeight,
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
    drawText(
      page,
      safePdfText(options.documentType.toLocaleUpperCase("da-DK")),
      {
        x: margin,
        y: pageSize[1] - 32,
        font: bold,
        size: 8.5,
        color: reportPalette.brandText,
      },
    );
    let titleY = pageSize[1] - 50;
    for (const line of titleLines) {
      drawText(page, line, {
        x: margin,
        y: titleY,
        font: bold,
        size: 14.5,
        color: reportPalette.ink,
      });
      titleY -= 14;
    }
    let contextY = titleY - 1;
    for (const line of contextLines) {
      drawText(page, line, {
        x: margin,
        y: contextY,
        font: regular,
        size: 8.8,
        color: reportPalette.muted,
      });
      contextY -= 11;
    }
    page.drawLine({
      start: { x: margin, y: pageSize[1] - reportHeaderHeight },
      end: { x: pageSize[0] - margin, y: pageSize[1] - reportHeaderHeight },
      thickness: 0.7,
      color: reportPalette.line,
    });
  };

  const drawFooter = () => {
    page.drawLine({
      start: { x: margin, y: footerHeight + 8 },
      end: { x: pageSize[0] - margin, y: footerHeight + 8 },
      thickness: 0.5,
      color: reportPalette.line,
    });
    drawText(page, `Eksporteret ${formatPdfDate(generatedAt)}`, {
      x: margin,
      y: footerHeight - 7,
      font: regular,
      size: 8,
      color: reportPalette.muted,
    });
    drawText(page, `Side ${pageNumber}`, {
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
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageSize[0],
      height: pageSize[1],
      color: reportPalette.pageBackground,
    });
    pageNumber += 1;
    y = pageSize[1] - margin - reportHeaderHeight;
    drawHeader();
    if (activeCard) {
      page.drawRectangle({
        x: margin,
        y: y - 22,
        width: contentWidth,
        height: 22,
        color: reportPalette.brandSoft,
      });
      drawText(
        page,
        `${activeCard.number}. ${safePdfText(activeCard.title)} (fortsat)`,
        {
          x: margin + 12,
          y: y - 15,
          font: bold,
          size: 8.5,
          color: reportPalette.brandText,
        },
      );
      y -= 30;
    }
    if (activeInformationBox) {
      const x = margin + 12;
      const width = contentWidth - 24;
      page.drawRectangle({
        x,
        y: y - 20,
        width,
        height: 20,
        color: reportPalette.accentSoft,
      });
      drawText(page, `${safePdfText(activeInformationBox.title)} (fortsat)`, {
        x: x + 10,
        y: y - 14,
        font: bold,
        size: 8.2,
        color: reportPalette.accentText,
      });
      y -= 28;
    }
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
      const candidate = line.map((lineRun) => ({ ...lineRun }));
      mergeRun(candidate, { ...source, text });
      if (runLineWidth(candidate, size) <= maxWidth) {
        line = candidate;
        return;
      }
      if (line.length) pushLine();
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
      for (const token of safePdfText(run.text)
        .split(/(\n|\s+)/)
        .filter(Boolean)) {
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
      drawText(page, run.text, {
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
      textOptions.maxWidth ?? flowWidth() - indent,
    );
    for (const [index, line] of lines.entries()) {
      ensureSpace(
        lineHeight +
          (index === lines.length - 1 ? (textOptions.gapAfter ?? 0) : 0),
      );
      drawText(page, line, {
        x: flowX() + indent,
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
      const maxWidth = options.maxWidth ?? flowWidth() - indent - bulletWidth;
      const lines = options.runs?.length
        ? wrapRuns(options.runs, size, maxWidth)
        : wrapText(text, font, size, maxWidth).map((line) => [{ text: line }]);
      for (const [index, line] of lines.entries()) {
        ensureSpace(
          lineHeight +
            (index === lines.length - 1 ? (options.gapAfter ?? 0) : 0),
        );
        if (index === 0 && options.bullet) {
          drawText(page, safePdfText(options.bullet), {
            x: flowX() + indent,
            y,
            font: bold,
            size,
            color: options.color ?? reportPalette.ink,
          });
        }
        if (options.runs?.length) {
          drawRunLine(
            line,
            flowX() + indent + bulletWidth,
            y,
            size,
            options.color ?? reportPalette.ink,
          );
        } else {
          drawText(page, line[0]?.text ?? "", {
            x: flowX() + indent + bulletWidth,
            y,
            font,
            size,
            color: options.color ?? reportPalette.ink,
          });
        }
        y -= lineHeight;
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
          x: flowX(),
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
    ensureSpace(110);
    y -= 10;
    page.drawRectangle({
      x: flowX(),
      y: y - 6,
      width: 4,
      height: 18,
      color: reportPalette.brand,
    });
    drawText(page, safePdfText(title), {
      x: margin + 12,
      y,
      font: bold,
      size: 13,
      color: reportPalette.brandText,
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
    drawText(page, safePdfText(title), {
      x: flowX(),
      y,
      font: bold,
      size: 10.5,
      color: reportPalette.ink,
    });
    y -= 15;
  };

  const beginAgendaItemCard = (input: AgendaItemCardInput) => {
    if (activeCard) throw new Error("Et PDF-punktkort er allerede aktivt.");
    const title = `${input.number}. (${input.typeLabel}) ${input.title}`;
    const titleLines = wrapText(title, bold, 11.2, contentWidth - 22);
    const subtitleLines = input.subtitle
      ? wrapText(input.subtitle, regular, 8.6, contentWidth - 22)
      : [];
    const inlineSubtitleLines = subtitleLines.length <= 4 ? subtitleLines : [];
    const boxHeight =
      22 + titleLines.length * 13 + inlineSubtitleLines.length * 11;
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
      drawText(page, line, {
        x: margin + 12,
        y: localY,
        font: bold,
        size: 11.2,
        color: reportPalette.ink,
      });
      localY -= 13;
    }
    for (const line of inlineSubtitleLines) {
      drawText(page, line, {
        x: margin + 12,
        y: localY,
        font: regular,
        size: 8.6,
        color: reportPalette.muted,
      });
      localY -= 11;
    }
    y -= boxHeight + 6;
    activeCard = {
      ...input,
      startPageIndex: pageNumber - 1,
      startY: y + boxHeight + 8,
    };
    if (subtitleLines.length > inlineSubtitleLines.length && input.subtitle) {
      addText(input.subtitle, {
        size: 8.6,
        color: reportPalette.muted,
        indent: 12,
        maxWidth: contentWidth - 22,
        gapAfter: 8,
      });
    }
  };

  const drawBoxBorders = (
    startPageIndex: number,
    startY: number,
    endY: number,
    inset: number,
    color: RGB,
  ) => {
    const pages = document.getPages();
    const endPageIndex = pageNumber - 1;
    for (let index = startPageIndex; index <= endPageIndex; index += 1) {
      const targetPage = pages[index];
      const top = index === startPageIndex ? startY : contentTop();
      const bottom = index === endPageIndex ? endY : footerHeight + margin - 4;
      if (top <= bottom) continue;
      targetPage.drawRectangle({
        x: margin + inset,
        y: bottom,
        width: contentWidth - inset * 2,
        height: top - bottom,
        borderColor: color,
        borderWidth: 0.65,
      });
    }
  };

  const endAgendaItemCard = () => {
    if (!activeCard) return;
    if (activeInformationBox) endInformationBox();
    y -= 4;
    drawBoxBorders(
      activeCard.startPageIndex,
      activeCard.startY,
      y,
      0,
      reportPalette.line,
    );
    activeCard = null;
    y -= 12;
  };

  const beginInformationBox = (title: string) => {
    if (!activeCard)
      throw new Error("En informationsboks kræver et punktkort.");
    if (activeInformationBox) {
      throw new Error("En PDF-informationsboks er allerede aktiv.");
    }
    ensureSpace(48);
    const x = flowX();
    const width = flowWidth();
    page.drawRectangle({
      x,
      y: y - 24,
      width,
      height: 24,
      color: reportPalette.accentSoft,
    });
    page.drawRectangle({
      x,
      y: y - 24,
      width: 3,
      height: 24,
      color: reportPalette.accent,
    });
    drawText(page, safePdfText(title), {
      x: x + 10,
      y: y - 16,
      font: bold,
      size: 9.2,
      color: reportPalette.accentText,
    });
    activeInformationBox = {
      title,
      startPageIndex: pageNumber - 1,
      startY: y,
    };
    y -= 34;
  };

  function endInformationBox() {
    if (!activeInformationBox) return;
    y -= 3;
    drawBoxBorders(
      activeInformationBox.startPageIndex,
      activeInformationBox.startY,
      y,
      12,
      reportPalette.accent,
    );
    activeInformationBox = null;
    y -= 9;
  }

  const addMetaGrid = (items: PdfMetaItem[]) => {
    const visible = items.filter((item) => item.value);
    if (!visible.length) return;
    const availableWidth = flowWidth();
    const columnWidth = availableWidth / 2 - 8;
    for (let index = 0; index < visible.length; index += 2) {
      const row = visible.slice(index, index + 2);
      const prepared = row.map((item) => ({
        item,
        valueLines: wrapText(item.value, regular, 8.8, columnWidth - 16),
      }));
      const rowHeight = Math.max(
        36,
        Math.max(...prepared.map((item) => item.valueLines.length)) * 10.5 + 21,
      );
      const maxCardHeight =
        pageSize[1] - reportHeaderHeight - footerHeight - margin * 2 - 20;
      if (rowHeight > maxCardHeight) {
        for (const item of row) {
          addSubsection(item.label);
          addText(item.value, { size: 8.8, gapAfter: 8 });
        }
        continue;
      }
      ensureSpace(rowHeight + 8);
      row.forEach((item, column) => {
        const valueLines = prepared[column].valueLines;
        const x = flowX() + column * (columnWidth + 16);
        page.drawRectangle({
          x,
          y: y - rowHeight + 7,
          width: columnWidth,
          height: rowHeight,
          color: reportPalette.secondarySoft,
        });
        drawText(page, safePdfText(item.label.toLocaleUpperCase("da-DK")), {
          x: x + 8,
          y: y - 2,
          font: bold,
          size: 7,
          color: reportPalette.muted,
        });
        let valueY = y - 16;
        for (const line of valueLines) {
          drawText(page, line, {
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
      flowWidth(),
    );
    ensureSpace(19);
    page.drawRectangle({
      x: flowX(),
      y: y - 7,
      width,
      height: 16,
      color: colors.fill,
      borderColor: reportPalette.line,
      borderWidth: 0.3,
    });
    drawText(page, safePdfText(label), {
      x: flowX() + 8,
      y: y - 3,
      font: bold,
      size: 8,
      color: colors.text,
    });
    y -= 24;
  };

  const addTable = <T>(
    columns: TableColumn<T>[],
    rows: T[],
    emptyText: string,
    tableOptions: TableOptions = {},
  ) => {
    if (!rows.length) {
      addParagraph(emptyText);
      return;
    }

    const availableWidth = flowWidth();
    const specifiedWidth = columns.reduce(
      (sum, column) => sum + column.width,
      0,
    );
    const scale = specifiedWidth ? availableWidth / specifiedWidth : 1;
    const scaledColumns = columns.map((column) => ({
      ...column,
      width: column.width * scale,
    }));
    const headerHeight = 22;
    const lineHeight = 12;
    const minimumContinuationLines = Math.max(
      2,
      tableOptions.minimumContinuationLines ?? 3,
    );
    let shouldDrawHeader = true;
    const badgeColors = {
      neutral: { fill: reportPalette.subtle, text: reportPalette.muted },
      progress: {
        fill: rgb(0.87, 0.93, 0.99),
        text: rgb(0.08, 0.29, 0.56),
      },
      warning: { fill: rgb(0.99, 0.95, 0.79), text: rgb(0.47, 0.32, 0) },
      orange: { fill: rgb(0.99, 0.9, 0.8), text: rgb(0.55, 0.22, 0.02) },
      success: { fill: rgb(0.88, 0.95, 0.9), text: reportPalette.success },
      danger: { fill: rgb(0.97, 0.88, 0.88), text: reportPalette.danger },
    } satisfies Record<PdfTableBadgeTone, { fill: RGB; text: RGB }>;
    const drawTableHeader = () => {
      page.drawRectangle({
        x: flowX(),
        y: y - 15,
        width: availableWidth,
        height: headerHeight,
        color: reportPalette.brandSoft,
      });
      let headerX = flowX();
      for (const column of scaledColumns) {
        drawText(page, safePdfText(column.label), {
          x: headerX + 6,
          y: y - 8,
          font: bold,
          size: 8,
          color: reportPalette.brandText,
        });
        headerX += column.width;
      }
      y -= headerHeight;
      shouldDrawHeader = false;
    };

    for (const row of rows) {
      const cells = scaledColumns.map((column) => {
        const badge = column.getBadge?.(row) ?? null;
        const value = column.getValue(row);
        const lines = wrapText(
          value || (badge ? "" : "-"),
          regular,
          8.5,
          column.width - 10,
        );
        return {
          badge,
          lines,
          lineCount: lines.length + (badge ? 2 : 0),
        };
      });
      const lineCount = Math.max(...cells.map((cell) => cell.lineCount));
      let lineOffset = 0;
      while (lineOffset < lineCount) {
        const fullRowHeight = Math.max(26, lineCount * lineHeight + 12);
        const freshPageHeight =
          pageSize[1] -
          margin -
          reportHeaderHeight -
          headerHeight -
          (footerHeight + margin) -
          12;
        const currentHeightAfterHeader =
          y -
          (footerHeight + margin) -
          12 -
          (shouldDrawHeader ? headerHeight : 0);
        if (
          tableOptions.keepRowsTogether &&
          lineOffset === 0 &&
          fullRowHeight <= freshPageHeight &&
          fullRowHeight > currentHeightAfterHeader &&
          currentHeightAfterHeader < freshPageHeight - 0.5
        ) {
          newPage();
          shouldDrawHeader = true;
          continue;
        }

        if (shouldDrawHeader) {
          ensureSpace(headerHeight + 26);
          drawTableHeader();
        }
        const availableHeight = y - (footerHeight + margin) - 12;
        const availableLines = Math.max(
          1,
          Math.floor((availableHeight - 12) / lineHeight),
        );
        const remainingLines = lineCount - lineOffset;
        let linesOnPage = Math.max(1, Math.min(remainingLines, availableLines));

        if (
          tableOptions.keepRowsTogether &&
          lineOffset === 0 &&
          remainingLines > availableLines &&
          availableLines < minimumContinuationLines
        ) {
          newPage();
          shouldDrawHeader = true;
          continue;
        }

        const trailingLines = remainingLines - linesOnPage;
        if (
          tableOptions.keepRowsTogether &&
          trailingLines > 0 &&
          trailingLines < minimumContinuationLines &&
          linesOnPage - (minimumContinuationLines - trailingLines) >=
            minimumContinuationLines
        ) {
          linesOnPage -= minimumContinuationLines - trailingLines;
        }

        const rowHeight = Math.max(26, linesOnPage * lineHeight + 12);
        if (availableHeight < rowHeight) {
          newPage();
          shouldDrawHeader = true;
          continue;
        }

        page.drawRectangle({
          x: flowX(),
          y: y - rowHeight + 4,
          width: availableWidth,
          height: rowHeight,
          color: rgb(1, 1, 1),
          borderColor: reportPalette.line,
          borderWidth: 0.35,
        });
        let cellX = flowX();
        cells.forEach((cell, index) => {
          for (let offset = 0; offset < linesOnPage; offset += 1) {
            const virtualLine = lineOffset + offset;
            const cellY = y - 9 - offset * lineHeight;
            if (virtualLine < cell.lines.length) {
              drawText(page, cell.lines[virtualLine], {
                x: cellX + 6,
                y: cellY,
                font: regular,
                size: 8.5,
                color: reportPalette.ink,
              });
            } else if (cell.badge && virtualLine === cell.lines.length) {
              const colors = badgeColors[cell.badge.tone];
              const badgeWidth = Math.min(
                Math.max(
                  bold.widthOfTextAtSize(cell.badge.label, 7.2) + 12,
                  38,
                ),
                scaledColumns[index].width - 10,
              );
              page.drawRectangle({
                x: cellX + 5,
                y: cellY - 4,
                width: badgeWidth,
                height: 14,
                color: colors.fill,
                borderColor: reportPalette.line,
                borderWidth: 0.3,
              });
              drawText(page, safePdfText(cell.badge.label), {
                x: cellX + 11,
                y: cellY,
                font: bold,
                size: 7.2,
                color: colors.text,
              });
            }
          }
          cellX += scaledColumns[index].width;
        });
        y -= rowHeight;
        lineOffset += linesOnPage;
        if (lineOffset < lineCount) {
          newPage();
          shouldDrawHeader = true;
        }
      }
    }
    y -= 8;
  };

  const addAttachmentTitle = (attachment: PdfReportAttachment) => {
    const title = `Bilag ${attachment.appendixNumber} - ${attachment.pointLabel}: ${attachment.fileName}`;
    const titleLines = wrapText(title, bold, 10.2, contentWidth - 22);
    const boxHeight = Math.max(32, titleLines.length * 11.5 + 14);
    ensureSpace(boxHeight + 14);
    page.drawRectangle({
      x: margin,
      y: y - boxHeight + 7,
      width: contentWidth,
      height: boxHeight,
      color: reportPalette.brandSoft,
      borderColor: reportPalette.line,
      borderWidth: 0.35,
    });
    page.drawRectangle({
      x: margin,
      y: y - boxHeight + 7,
      width: 3,
      height: boxHeight,
      color: reportPalette.brand,
    });
    let titleY = y - 6;
    for (const line of titleLines) {
      drawText(page, line, {
        x: margin + 12,
        y: titleY,
        font: bold,
        size: 10.2,
        color: reportPalette.ink,
      });
      titleY -= 11.5;
    }
    y -= boxHeight + 10;
  };

  const addImageAttachment = async (attachment: PdfReportAttachment) => {
    if (!attachment.bytes) {
      addParagraph("Bilaget kunne ikke hentes og er derfor ikke indlejret.");
      return;
    }

    let image: PDFImage;
    try {
      image =
        attachment.embedType === "png"
          ? await document.embedPng(attachment.bytes)
          : await document.embedJpg(attachment.bytes);
    } catch (error) {
      console.warn("[pdf-report] Billedbilag kunne ikke indlejres.", {
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        error: error instanceof Error ? error.message : String(error),
      });
      addParagraph("Billedet kunne ikke indlejres i PDF'en.");
      return;
    }

    const availableHeight = y - (footerHeight + margin);
    const maxHeight = Math.max(120, availableHeight);
    const scale = Math.min(
      contentWidth / image.width,
      maxHeight / image.height,
      1,
    );
    const width = image.width * scale;
    const height = image.height * scale;
    if (height > availableHeight) {
      newPage();
      addAttachmentTitle(attachment);
    }
    page.drawImage(image, {
      x: margin + (contentWidth - width) / 2,
      y: y - height,
      width,
      height,
    });
    y -= height + 16;
  };

  const addPdfAttachment = async (
    attachment: PdfReportAttachment,
    hasMoreAttachments: boolean,
  ) => {
    if (!attachment.bytes) {
      addParagraph(
        "PDF-bilaget kunne ikke hentes og er derfor ikke indlejret.",
      );
      return;
    }

    try {
      const source = await PDFDocument.load(attachment.bytes, {
        ignoreEncryption: true,
      });
      const copiedPages = await document.copyPages(
        source,
        source.getPageIndices(),
      );
      addParagraph("PDF-bilaget er indsat på de følgende sider.");
      for (const copiedPage of copiedPages) {
        document.addPage(copiedPage);
      }
      pageNumber = document.getPageCount();
      if (hasMoreAttachments) {
        newPage();
      }
    } catch (error) {
      console.warn("[pdf-report] PDF-bilag kunne ikke indlejres.", {
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        error: error instanceof Error ? error.message : String(error),
      });
      addParagraph(
        "PDF-bilaget kunne ikke indlejres. Se den originale fil i appen.",
      );
    }
  };

  const addAttachments = async (attachments: PdfReportAttachment[]) => {
    if (!attachments.length) return;
    addSection("Bilag");

    for (const [index, attachment] of attachments.entries()) {
      addAttachmentTitle(attachment);
      if (attachment.embedType === "pdf") {
        await addPdfAttachment(attachment, index < attachments.length - 1);
        continue;
      }
      if (attachment.embedType === "png" || attachment.embedType === "jpg") {
        await addImageAttachment(attachment);
        continue;
      }
      addParagraph(
        "Bilaget er ikke indlejret, fordi filtypen ikke understøttes i PDF-eksporten.",
      );
    }
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
    beginAgendaItemCard,
    endAgendaItemCard,
    beginInformationBox,
    endInformationBox,
    addBadge,
    addKeyValue,
    addMetaGrid,
    addParagraph,
    addProse,
    addSection,
    addSubsection,
    addTable,
    addAttachments,
    addText,
    save,
  };
}
