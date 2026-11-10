import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  type PDFDocument,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";

export type PdfLetterhead = "vorbasse-marked";

// A fixed local asset, never a user-supplied path or remote URL.
export async function embedLetterhead(
  document: PDFDocument,
  preset?: PdfLetterhead | null,
) {
  if (preset !== "vorbasse-marked") return null;
  return document.embedPng(
    await readFile(
      path.join(process.cwd(), "public/letterheads/vorbasse-marked.png"),
    ),
  );
}

export function letterheadLayout(landscape: boolean) {
  return landscape
    ? { headerHeight: 132, footerHeight: 145 }
    : { headerHeight: 160, footerHeight: 263 };
}

export function drawLetterhead(page: PDFPage, image: PDFImage) {
  const { width, height } = page.getSize();
  if (width < height) {
    page.drawImage(image, { x: 0, y: 0, width, height });
    return;
  }
  // Preserve artwork proportions on landscape pages: the original header
  // sits at the right; the decorative foot is cropped to the bottom strip.
  const headerWidth = (height * image.width) / image.height;
  page.pushOperators(
    pushGraphicsState(),
    rectangle(0, height - 130, width, 130),
    clip(),
    endPath(),
  );
  page.drawImage(image, {
    x: width - headerWidth,
    y: 0,
    width: headerWidth,
    height,
  });
  page.pushOperators(popGraphicsState());
  page.pushOperators(
    pushGraphicsState(),
    rectangle(0, 0, width, 125),
    clip(),
    endPath(),
  );
  page.drawImage(image, {
    x: 0,
    y: 0,
    width,
    height: (width * image.height) / image.width,
  });
  page.pushOperators(popGraphicsState());
}
