import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";

import { formatPdfDate, safePdfText, type PdfReportBranding } from "@/lib/pdf-report";
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

function truncate(text: string, font: PDFFont, size: number, width: number) {
  const safe = safePdfText(text);
  if (font.widthOfTextAtSize(safe, size) <= width) return safe;
  let result = safe;
  while (
    result.length > 1 &&
    font.widthOfTextAtSize(`${result}...`, size) > width
  ) {
    result = result.slice(0, -1);
  }
  return `${result.trimEnd()}...`;
}

function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
  maxLines: number,
) {
  const words = safePdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    lines[maxLines - 1] = truncate(
      lines[maxLines - 1],
      font,
      size,
      width,
    );
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
  if (
    input.branding?.fontFamily &&
    !["Georgia", "Merriweather", "Times New Roman", "Courier New"].includes(
      input.branding.fontFamily,
    )
  ) {
    console.warn(
      `[annual-wheel-pdf] Brandingfont '${input.branding.fontFamily}' falder tilbage til en sikker PDF-standardfont.`,
    );
  }
  const serif = ["Georgia", "Merriweather", "Times New Roman"].includes(
    input.branding?.fontFamily ?? "",
  );
  const mono = input.branding?.fontFamily === "Courier New";
  const regular = await document.embedFont(
    mono
      ? StandardFonts.Courier
      : serif
        ? StandardFonts.TimesRoman
        : StandardFonts.Helvetica,
  );
  const bold = await document.embedFont(
    mono
      ? StandardFonts.CourierBold
      : serif
        ? StandardFonts.TimesRomanBold
        : StandardFonts.HelveticaBold,
  );
  const logo = await embedLogo(document, input.branding);
  const colors = {
    ink: rgb(0.1, 0.13, 0.14),
    muted: rgb(0.4, 0.45, 0.45),
    line: rgb(0.78, 0.82, 0.82),
    subtle: rgb(0.95, 0.96, 0.95),
    brand: pdfColor(input.branding?.primaryColor, rgb(0.07, 0.28, 0.24)),
    accent: pdfColor(input.branding?.accentColor, rgb(0.32, 0.48, 0.43)),
    brandSoft: tint(
      input.branding?.primaryColor,
      0.2,
      rgb(0.88, 0.94, 0.91),
    ),
    accentSoft: tint(
      input.branding?.accentColor,
      0.18,
      rgb(0.92, 0.95, 0.94),
    ),
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
    page.drawText(safePdfText(documentType.toLocaleUpperCase("da-DK")), {
      x: margin,
      y: landscapeA4[1] - 28,
      font: bold,
      size: 8,
      color: colors.brand,
    });
    page.drawText(safePdfText(title), {
      x: margin,
      y: landscapeA4[1] - 49,
      font: bold,
      size: 17,
      color: colors.ink,
    });
    page.drawText(safePdfText(input.organizationName), {
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
    page.drawText(`Eksporteret ${formatPdfDate(input.exportedAt)}`, {
      x: margin,
      y: footerHeight - 9,
      font: regular,
      size: 7.5,
      color: colors.muted,
    });
    page.drawText(`Side ${pageNumber}`, {
      x: landscapeA4[0] - margin - 32,
      y: footerHeight - 9,
      font: regular,
      size: 7.5,
      color: colors.muted,
    });
  };

  return { document, regular, bold, colors, addPage, footer };
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
  const rowHeight = 25;
  const tableTop = landscapeA4[1] - headerHeight - 20;
  const tableBottom = footerHeight + 17;
  const rowsPerPage = Math.max(
    1,
    Math.floor((tableTop - tableBottom - 30) / rowHeight),
  );
  const pages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    const page = pdf.addPage(
      `Årshjul overblik ${input.overview.year}`,
      "Arbejdsoversigt",
    );
    let y = tableTop;
    const columns = [
      { label: "Udvalg / kategori", width: widths.group },
      { label: "Aktivitet", width: widths.title },
      { label: "Status", width: widths.status },
      { label: "Ansvarlig", width: widths.responsible },
      ...months.map((label) => ({ label, width: widths.month })),
    ];
    let x = margin;
    for (const column of columns) {
      page.drawRectangle({
        x,
        y: y - 22,
        width: column.width,
        height: 22,
        color: pdf.colors.brandSoft,
        borderColor: pdf.colors.line,
        borderWidth: 0.35,
      });
      page.drawText(
        truncate(column.label, pdf.bold, 7.2, column.width - 6),
        {
          x: x + 3,
          y: y - 14,
          font: pdf.bold,
          size: 7.2,
          color: pdf.colors.brand,
        },
      );
      x += column.width;
    }
    y -= 22;

    const pageRows = rows.slice(
      pageIndex * rowsPerPage,
      (pageIndex + 1) * rowsPerPage,
    );
    if (!pageRows.length) {
      page.drawText("Ingen årshjulsaktiviteter i det valgte år.", {
        x: margin,
        y: y - 28,
        font: pdf.regular,
        size: 10,
        color: pdf.colors.muted,
      });
    }

    for (const event of pageRows) {
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
      x = margin;
      cells.forEach((cell, index) => {
        const width = [
          widths.group,
          widths.title,
          widths.status,
          widths.responsible,
        ][index];
        page.drawRectangle({
          x,
          y: y - rowHeight,
          width,
          height: rowHeight,
          color: pageRows.indexOf(event) % 2 ? rgb(1, 1, 1) : pdf.colors.subtle,
          borderColor: pdf.colors.line,
          borderWidth: 0.3,
        });
        page.drawText(truncate(cell, pdf.regular, 6.9, width - 6), {
          x: x + 3,
          y: y - 15,
          font: pdf.regular,
          size: 6.9,
          color: pdf.colors.ink,
        });
        x += width;
      });
      const activeMonths = monthsForEvent(event, input.overview.year);
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
            y: y - 15,
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
    }
    pdf.footer(page, pageIndex + 1);
  }

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
    page.drawText(`Kvartal ${quarter + 1}`, {
      x: quarterX + 8,
      y: contentTop - 15,
      font: pdf.bold,
      size: 9,
      color: pdf.colors.brand,
    });

    for (let offset = 0; offset < 3; offset += 1) {
      const month = quarter * 3 + offset;
      const monthY =
        contentTop -
        quarterHeader -
        offset * (monthHeight + gap) -
        monthHeight;
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
      page.drawText(monthNames[month], {
        x: quarterX + 8,
        y: monthY + monthHeight - 15,
        font: pdf.bold,
        size: 9,
        color: pdf.colors.ink,
      });
      let itemY = monthY + monthHeight - 37;
      for (const item of primaryItems.slice(0, maxItems)) {
        const dotColor =
          item.kind === "activity" ? pdf.colors.brand : pdf.colors.accent;
        page.drawCircle({
          x: quarterX + 9,
          y: itemY + 2,
          size: 2.4,
          color: dotColor,
        });
        const titleLines = wrap(
          item.title,
          pdf.regular,
          7.1,
          quarterWidth - 25,
          1,
        );
        page.drawText(titleLines[0], {
          x: quarterX + 16,
          y: itemY,
          font: pdf.regular,
          size: 7.1,
          color: pdf.colors.ink,
        });
        page.drawText(
          truncate(item.detail, pdf.regular, 5.9, quarterWidth - 25),
          {
            x: quarterX + 16,
            y: itemY - 8,
            font: pdf.regular,
            size: 5.9,
            color: pdf.colors.muted,
          },
        );
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
        page.drawText(
          truncate(summary, pdf.bold, 6.2, quarterWidth - 16),
          {
            x: quarterX + 8,
            y: monthY + 7,
            font: pdf.bold,
            size: 6.2,
            color: pdf.colors.muted,
          },
        );
      } else if (!primaryItems.length) {
        page.drawText("Ingen planlagte aktiviteter", {
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
  page.drawText("Aktivitet", {
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
  page.drawText("Møde", {
    x: 329,
    y: landscapeA4[1] - 63,
    font: pdf.regular,
    size: 6.8,
    color: pdf.colors.muted,
  });
  pdf.footer(page, 1);
  return pdf.document.save();
}
