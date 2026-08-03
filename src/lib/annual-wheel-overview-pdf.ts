import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";

import {
  formatPdfDate,
  safePdfText,
  type PdfReportBranding,
} from "@/lib/pdf-report";
import { embedPdfFonts } from "@/lib/pdf-fonts";
import type {
  AnnualWheelEventView,
  AnnualWheelOverview,
  OrganizationMemberDirectoryEntry,
} from "@/types/domain";

type AnnualWheelOverviewPdfInput = {
  organizationName: string;
  overview: AnnualWheelOverview;
  exportedAt: Date;
  committeeId?: string | null;
  branding?: PdfReportBranding;
};

const landscapeA4: [number, number] = [841.89, 595.28];
const margin = 30;
const headerHeight = 72;
const footerHeight = 28;
const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Maj",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dec",
];
const monthNames = [
  "Januar",
  "Februar",
  "Marts",
  "April",
  "Maj",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "December",
];
const eventStatusLabels: Record<AnnualWheelEventView["status"], string> = {
  planned: "Planlagt",
  in_progress: "I gang",
  completed: "Gennemført",
  postponed: "Udsat",
  cancelled: "Annulleret",
};
const priorityLabels: Record<AnnualWheelEventView["priority"], string> = {
  low: "Lav",
  medium: "Normal",
  high: "Høj",
  critical: "Kritisk",
};

function normalizeHex(value: string | null | undefined) {
  const raw = value?.trim().replace(/^#/, "");
  return raw && /^[0-9a-fA-F]{6}$/.test(raw) ? raw : null;
}

function pdfColor(value: string | null | undefined, fallback: RGB) {
  const hex = normalizeHex(value);
  if (!hex) return fallback;
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  );
}

function tint(value: string | null | undefined, amount: number, fallback: RGB) {
  const hex = normalizeHex(value);
  if (!hex) return fallback;
  const channels = [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ].map((channel) => (channel * amount + 255 * (1 - amount)) / 255);
  return rgb(channels[0], channels[1], channels[2]);
}

async function embedLogo(
  document: PDFDocument,
  branding: PdfReportBranding | undefined,
) {
  if (!branding?.logoBytes || !branding.logoMimeType) return null;
  try {
    return branding.logoMimeType === "image/png"
      ? await document.embedPng(branding.logoBytes)
      : await document.embedJpg(branding.logoBytes);
  } catch {
    return null;
  }
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of safePdfText(text).split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (font.widthOfTextAtSize(word, size) > width) {
        if (line) lines.push(line);
        line = "";
        let chunk = "";
        for (const character of word) {
          const candidate = `${chunk}${character}`;
          if (!chunk || font.widthOfTextAtSize(candidate, size) <= width) {
            chunk = candidate;
          } else {
            lines.push(chunk);
            chunk = character;
          }
        }
        line = chunk;
        continue;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [""];
}

function memberName(
  members: OrganizationMemberDirectoryEntry[],
  userId: string | null,
) {
  if (!userId) return "Ikke angivet";
  const member = members.find((item) => item.user_id === userId);
  return member?.full_name || member?.email || "Ikke angivet";
}

function monthsForEvent(event: AnnualWheelEventView, year: number) {
  const from = new Date(`${event.starts_on}T00:00:00Z`);
  const to = new Date(`${event.ends_on}T00:00:00Z`);
  const result = new Set<number>();
  for (let month = 0; month < 12; month += 1) {
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0));
    if (from <= monthEnd && to >= monthStart) result.add(month);
  }
  return result;
}

function filteredOverview(input: AnnualWheelOverviewPdfInput) {
  const committeeId = input.committeeId || null;
  return {
    events: input.overview.events.filter(
      (event) => !committeeId || event.committee_id === committeeId,
    ),
    calendarItems: input.overview.calendarItems.filter(
      (item) => !committeeId || item.committeeId === committeeId,
    ),
  };
}

async function createLandscapeDocument(input: AnnualWheelOverviewPdfInput) {
  const document = await PDFDocument.create();
  const { regular, bold, drawText } = await embedPdfFonts(document);
  document.setCreationDate(input.exportedAt);
  document.setModificationDate(input.exportedAt);
  document.setCreator("BestyrelsesApp");
  document.setProducer("BestyrelsesApp PDF export");
  const logo = await embedLogo(document, input.branding);
  const colors = {
    ink: rgb(0.1, 0.13, 0.14),
    muted: rgb(0.4, 0.45, 0.45),
    line: rgb(0.78, 0.82, 0.82),
    subtle: rgb(0.95, 0.96, 0.95),
    brand: pdfColor(input.branding?.primaryColor, rgb(0.07, 0.28, 0.24)),
    accent: pdfColor(input.branding?.accentColor, rgb(0.32, 0.48, 0.43)),
    brandSoft: tint(input.branding?.primaryColor, 0.2, rgb(0.88, 0.94, 0.91)),
    accentSoft: tint(input.branding?.accentColor, 0.18, rgb(0.92, 0.95, 0.94)),
  };

  const addPage = (title: string, documentType: string) => {
    const page = document.addPage(landscapeA4);
    page.drawRectangle({
      x: 0,
      y: landscapeA4[1] - headerHeight,
      width: landscapeA4[0],
      height: headerHeight,
      color: colors.brandSoft,
    });
    page.drawRectangle({
      x: 0,
      y: landscapeA4[1] - 4,
      width: landscapeA4[0],
      height: 4,
      color: colors.brand,
    });
    drawText(page, safePdfText(documentType.toLocaleUpperCase("da-DK")), {
      x: margin,
      y: landscapeA4[1] - 28,
      font: bold,
      size: 8,
      color: colors.brand,
    });
    drawText(page, safePdfText(title), {
      x: margin,
      y: landscapeA4[1] - 49,
      font: bold,
      size: 17,
      color: colors.ink,
    });
    drawText(page, safePdfText(input.organizationName), {
      x: margin,
      y: landscapeA4[1] - 64,
      font: regular,
      size: 8.5,
      color: colors.muted,
    });
    if (logo) {
      const scale = Math.min(78 / logo.width, 36 / logo.height, 1);
      page.drawImage(logo, {
        x: landscapeA4[0] - margin - logo.width * scale,
        y: landscapeA4[1] - 58,
        width: logo.width * scale,
        height: logo.height * scale,
      });
    }
    return page;
  };

  const footer = (page: PDFPage, pageNumber: number) => {
    page.drawLine({
      start: { x: margin, y: footerHeight + 5 },
      end: { x: landscapeA4[0] - margin, y: footerHeight + 5 },
      thickness: 0.5,
      color: colors.line,
    });
    drawText(page, `Eksporteret ${formatPdfDate(input.exportedAt)}`, {
      x: margin,
      y: footerHeight - 9,
      font: regular,
      size: 7.5,
      color: colors.muted,
    });
    drawText(page, `Side ${pageNumber}`, {
      x: landscapeA4[0] - margin - 32,
      y: footerHeight - 9,
      font: regular,
      size: 7.5,
      color: colors.muted,
    });
  };

  return { document, regular, bold, colors, addPage, footer, drawText };
}

export async function generateAnnualWheelMatrixPdf(
  input: AnnualWheelOverviewPdfInput,
) {
  const pdf = await createLandscapeDocument(input);
  const { events } = filteredOverview(input);
  const rows = [...events].sort((left, right) => {
    const leftGroup = `${left.committee?.name ?? "Hele organisationen"} ${left.category ?? ""}`;
    const rightGroup = `${right.committee?.name ?? "Hele organisationen"} ${right.category ?? ""}`;
    return (
      leftGroup.localeCompare(rightGroup, "da-DK") ||
      left.starts_on.localeCompare(right.starts_on) ||
      left.title.localeCompare(right.title, "da-DK")
    );
  });
  const contentWidth = landscapeA4[0] - margin * 2;
  const widths = {
    group: 100,
    title: 150,
    status: 70,
    responsible: 85,
    month: (contentWidth - 100 - 150 - 70 - 85) / 12,
  };
  const tableTop = landscapeA4[1] - headerHeight - 20;
  const tableBottom = footerHeight + 17;
  const columns = [
    { label: "Udvalg / kategori", width: widths.group },
    { label: "Aktivitet", width: widths.title },
    { label: "Status", width: widths.status },
    { label: "Ansvarlig", width: widths.responsible },
    ...months.map((label) => ({ label, width: widths.month })),
  ];
  const headerRowHeight = 22;
  const lineHeight = 9;
  let pageNumber = 0;
  let page!: PDFPage;
  let y = tableTop;

  const newTablePage = () => {
    if (pageNumber) pdf.footer(page, pageNumber);
    pageNumber += 1;
    page = pdf.addPage(
      `Årshjul overblik ${input.overview.year}`,
      "Arbejdsoversigt",
    );
    y = tableTop;
    let x = margin;
    for (const column of columns) {
      page.drawRectangle({
        x,
        y: y - headerRowHeight,
        width: column.width,
        height: headerRowHeight,
        color: pdf.colors.brandSoft,
        borderColor: pdf.colors.line,
        borderWidth: 0.35,
      });
      pdf.drawText(page, safePdfText(column.label), {
        x: x + 3,
        y: y - 14,
        font: pdf.bold,
        size: 7.2,
        color: pdf.colors.brand,
      });
      x += column.width;
    }
    y -= headerRowHeight;
  };

  newTablePage();

  if (!rows.length) {
    pdf.drawText(page, "Ingen årshjulsaktiviteter i det valgte år.", {
      x: margin,
      y: y - 28,
      font: pdf.regular,
      size: 10,
      color: pdf.colors.muted,
    });
  }

  for (const [eventIndex, event] of rows.entries()) {
    const group = [
      event.committee?.name ?? "Hele organisationen",
      event.category,
    ]
      .filter(Boolean)
      .join(" / ");
    const cells = [
      group,
      event.title,
      `${eventStatusLabels[event.status]} · ${priorityLabels[event.priority]}`,
      event.responsible?.full_name ||
        memberName(input.overview.members, event.responsible_user_id),
    ];
    const cellWidths = [
      widths.group,
      widths.title,
      widths.status,
      widths.responsible,
    ];
    const cellLines = cells.map((cell, index) =>
      wrap(cell, pdf.regular, 6.9, cellWidths[index] - 6),
    );
    const activeMonths = monthsForEvent(event, input.overview.year);
    const totalLines = Math.max(...cellLines.map((lines) => lines.length));
    let lineOffset = 0;

    while (lineOffset < totalLines) {
      const availableLines = Math.floor((y - tableBottom - 10) / lineHeight);
      if (availableLines < 1) {
        newTablePage();
        continue;
      }
      const linesInFragment = Math.min(totalLines - lineOffset, availableLines);
      const rowHeight = Math.max(25, linesInFragment * lineHeight + 10);
      let x = margin;
      cellLines.forEach((lines, index) => {
        const width = cellWidths[index];
        const fill = eventIndex % 2 ? rgb(1, 1, 1) : pdf.colors.subtle;
        page.drawRectangle({
          x,
          y: y - rowHeight,
          width,
          height: rowHeight,
          color: fill,
          borderColor: pdf.colors.line,
          borderWidth: 0.3,
        });
        let textY = y - 11;
        for (const line of lines.slice(
          lineOffset,
          lineOffset + linesInFragment,
        )) {
          pdf.drawText(page, line, {
            x: x + 3,
            y: textY,
            font: pdf.regular,
            size: 6.9,
            color: pdf.colors.ink,
          });
          textY -= lineHeight;
        }
        x += width;
      });

      for (let month = 0; month < 12; month += 1) {
        page.drawRectangle({
          x,
          y: y - rowHeight,
          width: widths.month,
          height: rowHeight,
          color: activeMonths.has(month)
            ? event.status === "completed"
              ? pdf.colors.accentSoft
              : pdf.colors.brandSoft
            : rgb(1, 1, 1),
          borderColor: pdf.colors.line,
          borderWidth: 0.3,
        });
        if (activeMonths.has(month)) {
          page.drawRectangle({
            x: x + 5,
            y: y - rowHeight / 2 - 2,
            width: Math.max(4, widths.month - 10),
            height: 4,
            color:
              event.status === "completed"
                ? pdf.colors.accent
                : pdf.colors.brand,
          });
        }
        x += widths.month;
      }
      y -= rowHeight;
      lineOffset += linesInFragment;
      if (lineOffset < totalLines) newTablePage();
    }
  }

  pdf.footer(page, pageNumber);

  return pdf.document.save();
}

export async function generateAnnualWheelVisualPdf(
  input: AnnualWheelOverviewPdfInput,
) {
  const pdf = await createLandscapeDocument(input);
  const { events, calendarItems } = filteredOverview(input);
  const page = pdf.addPage(`Årshjul ${input.overview.year}`, "Visuelt årshjul");
  const contentTop = landscapeA4[1] - headerHeight - 18;
  const contentBottom = footerHeight + 18;
  const contentWidth = landscapeA4[0] - margin * 2;
  const gap = 9;
  const quarterWidth = (contentWidth - gap * 3) / 4;
  const quarterHeader = 23;
  const monthHeight =
    (contentTop - contentBottom - quarterHeader - gap * 2) / 3;

  for (let quarter = 0; quarter < 4; quarter += 1) {
    const quarterX = margin + quarter * (quarterWidth + gap);
    page.drawRectangle({
      x: quarterX,
      y: contentTop - quarterHeader,
      width: quarterWidth,
      height: quarterHeader,
      color: quarter % 2 ? pdf.colors.accentSoft : pdf.colors.brandSoft,
    });
    pdf.drawText(page, `Kvartal ${quarter + 1}`, {
      x: quarterX + 8,
      y: contentTop - 15,
      font: pdf.bold,
      size: 9,
      color: pdf.colors.brand,
    });

    for (let offset = 0; offset < 3; offset += 1) {
      const month = quarter * 3 + offset;
      const monthY =
        contentTop - quarterHeader - offset * (monthHeight + gap) - monthHeight;
      const eventItems = events
        .filter((event) =>
          monthsForEvent(event, input.overview.year).has(month),
        )
        .map((event) => ({
          kind: "activity" as const,
          title: event.title,
          detail: event.committee?.name ?? event.category ?? "Organisation",
        }));
      const meetingItems = calendarItems
        .filter(
          (item) =>
            item.kind === "meeting" &&
            Number(item.date.slice(5, 7)) - 1 === month,
        )
        .map((item) => ({
          kind: "meeting" as const,
          title: item.title,
          detail:
            input.overview.committees.find(
              (committee) => committee.id === item.committeeId,
            )?.name ?? "Møde",
        }));
      const secondaryCount = calendarItems.filter(
        (item) =>
          item.kind !== "meeting" &&
          Number(item.date.slice(5, 7)) - 1 === month,
      ).length;
      const primaryItems = [...eventItems, ...meetingItems];
      const maxItems = 4;

      page.drawRectangle({
        x: quarterX,
        y: monthY,
        width: quarterWidth,
        height: monthHeight,
        color: rgb(1, 1, 1),
        borderColor: pdf.colors.line,
        borderWidth: 0.6,
      });
      page.drawRectangle({
        x: quarterX,
        y: monthY + monthHeight - 23,
        width: quarterWidth,
        height: 23,
        color: pdf.colors.subtle,
      });
      pdf.drawText(page, monthNames[month], {
        x: quarterX + 8,
        y: monthY + monthHeight - 15,
        font: pdf.bold,
        size: 9,
        color: pdf.colors.ink,
      });
      let itemY = monthY + monthHeight - 37;
      for (const [itemIndex, item] of primaryItems
        .slice(0, maxItems)
        .entries()) {
        const dotColor =
          item.kind === "activity" ? pdf.colors.brand : pdf.colors.accent;
        page.drawCircle({
          x: quarterX + 9,
          y: itemY + 2,
          size: 2.4,
          color: dotColor,
        });
        const safeTitle = safePdfText(item.title);
        const titleLabel =
          pdf.regular.widthOfTextAtSize(safeTitle, 7.1) <= quarterWidth - 25
            ? safeTitle
            : `${itemIndex + 1}. Se fuld titel i aktivitetslisten`;
        pdf.drawText(page, titleLabel, {
          x: quarterX + 16,
          y: itemY,
          font: pdf.regular,
          size: 7.1,
          color: pdf.colors.ink,
        });
        const safeDetail = safePdfText(item.detail);
        const detailLabel =
          pdf.regular.widthOfTextAtSize(safeDetail, 5.9) <= quarterWidth - 25
            ? safeDetail
            : "Detaljer i aktivitetslisten";
        pdf.drawText(page, detailLabel, {
          x: quarterX + 16,
          y: itemY - 8,
          font: pdf.regular,
          size: 5.9,
          color: pdf.colors.muted,
        });
        itemY -= 21;
      }
      const hidden = Math.max(0, primaryItems.length - maxItems);
      const summary = [
        hidden ? `+${hidden} flere` : "",
        secondaryCount ? `${secondaryCount} opgaver/deadlines` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      if (summary) {
        pdf.drawText(page, summary, {
          x: quarterX + 8,
          y: monthY + 7,
          font: pdf.bold,
          size: 6.2,
          color: pdf.colors.muted,
        });
      } else if (!primaryItems.length) {
        pdf.drawText(page, "Ingen planlagte aktiviteter", {
          x: quarterX + 8,
          y: monthY + monthHeight / 2 - 8,
          font: pdf.regular,
          size: 6.5,
          color: pdf.colors.muted,
        });
      }
    }
  }

  page.drawCircle({
    x: 260,
    y: landscapeA4[1] - 60,
    size: 2.5,
    color: pdf.colors.brand,
  });
  pdf.drawText(page, "Aktivitet", {
    x: 267,
    y: landscapeA4[1] - 63,
    font: pdf.regular,
    size: 6.8,
    color: pdf.colors.muted,
  });
  page.drawCircle({
    x: 322,
    y: landscapeA4[1] - 60,
    size: 2.5,
    color: pdf.colors.accent,
  });
  pdf.drawText(page, "Møde", {
    x: 329,
    y: landscapeA4[1] - 63,
    font: pdf.regular,
    size: 6.8,
    color: pdf.colors.muted,
  });
  pdf.drawText(page, "Fuld aktivitetsliste følger på de næste sider.", {
    x: 365,
    y: landscapeA4[1] - 63,
    font: pdf.bold,
    size: 6.8,
    color: pdf.colors.muted,
  });
  pdf.footer(page, 1);

  let pageNumber = 1;
  let appendixPage!: PDFPage;
  let appendixY = 0;
  const appendixTop = landscapeA4[1] - headerHeight - 20;
  const appendixBottom = footerHeight + 18;
  const appendixWidth = landscapeA4[0] - margin * 2;

  const newAppendixPage = () => {
    if (pageNumber > 1) pdf.footer(appendixPage, pageNumber);
    pageNumber += 1;
    appendixPage = pdf.addPage(
      `Aktivitetsliste ${input.overview.year}`,
      "Komplet årshjul",
    );
    appendixY = appendixTop;
  };

  const ensureAppendixSpace = (height: number) => {
    if (!appendixPage || appendixY - height < appendixBottom) newAppendixPage();
  };

  for (let month = 0; month < 12; month += 1) {
    const monthEvents = events
      .filter((event) => monthsForEvent(event, input.overview.year).has(month))
      .map((event) => ({
        kind: "Aktivitet",
        title: event.title,
        detail: [
          `${event.starts_on} - ${event.ends_on}`,
          event.committee?.name ?? event.category ?? "Organisation",
          event.responsible?.full_name ||
            memberName(input.overview.members, event.responsible_user_id),
        ].join(" · "),
      }));
    const monthCalendarItems = calendarItems
      .filter((item) => Number(item.date.slice(5, 7)) - 1 === month)
      .map((item) => ({
        kind:
          item.kind === "meeting"
            ? "Møde"
            : item.kind === "task"
              ? "Opgave"
              : "Beslutning",
        title: item.title,
        detail: [
          item.date,
          input.overview.committees.find(
            (committee) => committee.id === item.committeeId,
          )?.name ?? "Organisation",
          memberName(input.overview.members, item.responsibleUserId),
        ].join(" · "),
      }));
    const items = [...monthEvents, ...monthCalendarItems];
    ensureAppendixSpace(34);
    appendixPage.drawRectangle({
      x: margin,
      y: appendixY - 22,
      width: appendixWidth,
      height: 22,
      color: pdf.colors.brandSoft,
    });
    pdf.drawText(appendixPage, monthNames[month], {
      x: margin + 8,
      y: appendixY - 15,
      font: pdf.bold,
      size: 9,
      color: pdf.colors.brand,
    });
    appendixY -= 30;

    if (!items.length) {
      ensureAppendixSpace(18);
      pdf.drawText(appendixPage, "Ingen planlagte aktiviteter.", {
        x: margin + 8,
        y: appendixY,
        font: pdf.regular,
        size: 7.5,
        color: pdf.colors.muted,
      });
      appendixY -= 18;
      continue;
    }

    for (const item of items) {
      const titleLines = wrap(
        `${item.kind}: ${item.title}`,
        pdf.bold,
        8.2,
        appendixWidth - 16,
      );
      const detailLines = wrap(
        item.detail,
        pdf.regular,
        7.1,
        appendixWidth - 16,
      );
      const blockHeight = titleLines.length * 10 + detailLines.length * 9 + 10;
      ensureAppendixSpace(blockHeight);
      for (const line of titleLines) {
        pdf.drawText(appendixPage, line, {
          x: margin + 8,
          y: appendixY,
          font: pdf.bold,
          size: 8.2,
          color: pdf.colors.ink,
        });
        appendixY -= 10;
      }
      for (const line of detailLines) {
        pdf.drawText(appendixPage, line, {
          x: margin + 8,
          y: appendixY,
          font: pdf.regular,
          size: 7.1,
          color: pdf.colors.muted,
        });
        appendixY -= 9;
      }
      appendixY -= 10;
    }
  }

  if (pageNumber > 1) pdf.footer(appendixPage, pageNumber);
  return pdf.document.save();
}
