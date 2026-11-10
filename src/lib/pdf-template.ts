import {
  rgb,
  type PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { drawLetterhead, embedLetterhead } from "@/lib/pdf-letterhead";
import {
  templatePage,
  type PaperOrientation,
  type TemplateRect,
} from "@/lib/pdf-template-config";
import type { PdfReportBranding } from "@/lib/pdf-theme";
import type { embedPdfFonts } from "@/lib/pdf-fonts";

export const mmToPt = (mm: number) => (mm * 72) / 25.4;
export function pdfRect(rect: TemplateRect, pageHeight: number) {
  return {
    x: mmToPt(rect.x),
    top: pageHeight - mmToPt(rect.y),
    bottom: pageHeight - mmToPt(rect.y + rect.height),
    width: mmToPt(rect.width),
    height: mmToPt(rect.height),
  };
}

export async function preparePdfTemplate(
  document: PDFDocument,
  branding: PdfReportBranding | undefined,
  orientation: PaperOrientation,
) {
  const config = branding?.pdfTemplate;
  if (!config) return null;
  const layouts = [config[orientation].first, config[orientation].continuation];
  const preset = layouts.some((p) => p.background.kind === "vorbasse-marked")
    ? await embedLetterhead(document, "vorbasse-marked")
    : null;
  const images = new Map<string, PDFImage>();
  for (const layout of layouts) {
    if (
      layout.background.kind !== "image" ||
      images.has(layout.background.path)
    )
      continue;
    const source = branding?.templateImages?.[layout.background.path];
    if (!source)
      throw new Error(
        "Brevpapiret kunne ikke indlæses. Upload eller vælg det igen.",
      );
    images.set(
      layout.background.path,
      source.mimeType === "image/png"
        ? await document.embedPng(source.bytes)
        : await document.embedJpg(source.bytes),
    );
  }
  return {
    config,
    layout: (index: number) => templatePage(config, orientation, index),
    drawBackground(page: PDFPage, index: number) {
      const background = templatePage(config, orientation, index).background;
      if (background.kind === "vorbasse-marked" && preset)
        drawLetterhead(page, preset);
      if (background.kind === "image") {
        const image = images.get(background.path)!;
        const scale = Math.min(
          page.getWidth() / image.width,
          page.getHeight() / image.height,
        );
        page.drawImage(image, {
          x: (page.getWidth() - image.width * scale) / 2,
          y: (page.getHeight() - image.height * scale) / 2,
          width: image.width * scale,
          height: image.height * scale,
        });
      }
    },
  };
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const char of text.replace(/\s+/g, " ")) {
    if (font.widthOfTextAtSize(line + char, size) > width && line) {
      const split = line.lastIndexOf(" ");
      if (split > 0) {
        lines.push(line.slice(0, split));
        line = line.slice(split + 1) + char;
      } else {
        lines.push(line);
        line = char;
      }
    } else line += char;
  }
  if (line) lines.push(line);
  return lines;
}

export function drawTemplateHeader(
  page: PDFPage,
  rect: TemplateRect,
  title: string,
  context: string,
  font: PDFFont,
  drawText: Awaited<ReturnType<typeof embedPdfFonts>>["drawText"],
) {
  const box = pdfRect(rect, page.getHeight());
  const text = `${title} · ${context}`;
  let size = 12;
  let lines = wrap(text, font, size, box.width - 4);
  while (lines.length * size * 1.25 > box.height - 4 && size > 5) {
    size -= 0.5;
    lines = wrap(text, font, size, box.width - 4);
  }
  if (lines.length * size * 1.25 > box.height - 4)
    throw new Error(
      "Sidehovedet er for lille til dokumenttitlen. Gør feltet større.",
    );
  lines.forEach((line, i) =>
    drawText(page, line, {
      x: box.x + 2,
      y: box.top - size - 2 - i * size * 1.25,
      font,
      size,
      color: rgb(0.13, 0.16, 0.17),
    }),
  );
}

export function drawTemplateFooter(
  page: PDFPage,
  rect: TemplateRect,
  label: string,
  pageNumber: number,
  font: PDFFont,
) {
  const box = pdfRect(rect, page.getHeight());
  const size = 7;
  page.drawText(label, {
    x: box.x + 2,
    y: box.top - 10,
    font,
    size,
    color: rgb(0.4, 0.43, 0.44),
  });
  const number = `Side ${pageNumber}`;
  page.drawText(number, {
    x: box.x + box.width - font.widthOfTextAtSize(number, size) - 2,
    y: box.top - 10,
    font,
    size,
    color: rgb(0.4, 0.43, 0.44),
  });
}
