import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";

export type PdfMetaItem = {
  label: string;
  value: string;
};

export type PdfProseBlock = {
  type: "paragraph" | "heading" | "listItem" | "quote";
  text: string;
  ordered?: boolean;
  index?: number;
};

type PdfReportOptions = {
  documentType: string;
  title: string;
  subtitle?: string;
  organizationName?: string;
  committeeName?: string;
  generatedAt?: Date;
  meta?: PdfMetaItem[];
};

type TextOptions = {
  font?: PDFFont;
  size?: number;
  color?: RGB;
  indent?: number;
  gapAfter?: number;
  maxWidth?: number;
  fallback?: string;
};

type TableColumn<T> = {
  label: string;
  width: number;
  getValue: (row: T) => string;
};

const pageSize: [number, number] = [595.28, 841.89];
const margin = 46;
const headerHeight = 78;
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

export function safePdfText(value: string) {
  return value.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

export function formatPdfDate(value: string | Date, withTime = false) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "long",
    ...(withTime ? { timeStyle: "short" as const } : {}),
  }).format(value instanceof Date ? value : new Date(value));
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
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
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
      color: palette.subtle,
    });
    page.drawText(safePdfText(options.documentType.toLocaleUpperCase("da-DK")), {
      x: margin,
      y: pageSize[1] - 32,
      font: bold,
      size: 8.5,
      color: palette.brand,
    });
    page.drawText(safePdfText(options.title), {
      x: margin,
      y: pageSize[1] - 52,
      font: bold,
      size: 15,
      color: palette.ink,
    });
    const context = [
      options.organizationName,
      options.committeeName,
      options.subtitle,
    ]
      .filter(Boolean)
      .join("  |  ");
    if (context) {
      page.drawText(safePdfText(context), {
        x: margin,
        y: pageSize[1] - 68,
        font: regular,
        size: 9,
        color: palette.muted,
      });
    }
    page.drawLine({
      start: { x: margin, y: pageSize[1] - headerHeight },
      end: { x: pageSize[0] - margin, y: pageSize[1] - headerHeight },
      thickness: 0.7,
      color: palette.line,
    });
  };

  const drawFooter = () => {
    const generatedAt = options.generatedAt ?? new Date();
    page.drawLine({
      start: { x: margin, y: footerHeight + 8 },
      end: { x: pageSize[0] - margin, y: footerHeight + 8 },
      thickness: 0.5,
      color: palette.line,
    });
    page.drawText(`Eksporteret ${formatPdfDate(generatedAt)}`, {
      x: margin,
      y: footerHeight - 7,
      font: regular,
      size: 8,
      color: palette.muted,
    });
    page.drawText(`Side ${pageNumber}`, {
      x: pageSize[0] - margin - 36,
      y: footerHeight - 7,
      font: regular,
      size: 8,
      color: palette.muted,
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
        color: textOptions.color ?? palette.ink,
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
      const lines = wrapText(
        text,
        font,
        size,
        options.maxWidth ?? contentWidth - indent - bulletWidth,
      );
      ensureSpace(lines.length * lineHeight + (options.gapAfter ?? 0));
      if (options.bullet) {
        page.drawText(safePdfText(options.bullet), {
          x: margin + indent,
          y,
          font: bold,
          size,
          color: options.color ?? palette.ink,
        });
      }
      for (const [index, line] of lines.entries()) {
        page.drawText(line, {
          x: margin + indent + bulletWidth,
          y,
          font,
          size,
          color: options.color ?? palette.ink,
        });
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
          color: palette.line,
        });
        addProseLine(block.text, {
          color: palette.muted,
          indent: 12,
          gapAfter: 9,
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
        addProseLine(block.text, { gapAfter: 10 });
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
      color: palette.brand,
    });
    page.drawText(safePdfText(title), {
      x: margin + 12,
      y,
      font: bold,
      size: 13,
      color: palette.brand,
    });
    y -= 18;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageSize[0] - margin, y },
      thickness: 0.5,
      color: palette.line,
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
      color: palette.ink,
    });
    y -= 15;
  };

  const addMetaGrid = (items: PdfMetaItem[]) => {
    const visible = items.filter((item) => item.value);
    if (!visible.length) return;
    const columnWidth = contentWidth / 2 - 8;
    const rowHeight = 35;
    for (let index = 0; index < visible.length; index += 2) {
      ensureSpace(rowHeight + 8);
      const row = visible.slice(index, index + 2);
      row.forEach((item, column) => {
        const x = margin + column * (columnWidth + 16);
        page.drawRectangle({
          x,
          y: y - 24,
          width: columnWidth,
          height: 30,
          color: palette.subtle,
        });
        page.drawText(safePdfText(item.label.toLocaleUpperCase("da-DK")), {
          x: x + 8,
          y: y - 2,
          font: bold,
          size: 7,
          color: palette.muted,
        });
        page.drawText(safePdfText(item.value), {
          x: x + 8,
          y: y - 16,
          font: regular,
          size: 9,
          color: palette.ink,
        });
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
      neutral: { fill: palette.subtle, text: palette.ink },
      success: { fill: rgb(0.88, 0.95, 0.9), text: palette.success },
      warning: { fill: rgb(0.98, 0.93, 0.84), text: palette.warning },
      danger: { fill: rgb(0.97, 0.88, 0.88), text: palette.danger },
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
      borderColor: palette.line,
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
    let shouldDrawHeader = true;
    const drawTableHeader = () => {
      page.drawRectangle({
        x: margin,
        y: y - 15,
        width: contentWidth,
        height: headerHeight,
        color: palette.brandSoft,
      });
      let headerX = margin;
      for (const column of columns) {
        page.drawText(safePdfText(column.label), {
          x: headerX + 6,
          y: y - 8,
          font: bold,
          size: 8,
          color: palette.brand,
        });
        headerX += column.width;
      }
      y -= headerHeight;
      shouldDrawHeader = false;
    };

    for (const row of rows) {
      const cells = columns.map((column) =>
        wrapText(column.getValue(row) || "-", regular, 8.5, column.width - 10),
      );
      const rowHeight =
        Math.max(24, Math.max(...cells.map((cell) => cell.length)) * lineHeight + 10);
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
        borderColor: palette.line,
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
            color: palette.ink,
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
    fonts: { regular, bold },
    palette,
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
