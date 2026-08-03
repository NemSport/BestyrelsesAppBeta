import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import { generateMeetingAgendaPdf } from "../../src/lib/agenda-pdf";
import { generateAnnualWheelMatrixPdf } from "../../src/lib/annual-wheel-overview-pdf";
import { pdfContentDisposition, pdfFileSlug } from "../../src/lib/pdf-response";
import { safePdfText } from "../../src/lib/pdf-report";
import {
  generateIssue12Fixtures,
  longUrl,
  unicodeMarker,
} from "./pdf-fixtures";

const workspace = process.cwd();

async function extractPdf(bytes: Uint8Array) {
  const loadingTask = getDocument({ data: bytes });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
    );
  }
  await document.destroy();
  return { pages: document.numPages, text: pages.join("\n") };
}

test("Unicode text is preserved before PDF layout", () => {
  assert.equal(safePdfText(unicodeMarker), unicodeMarker);
  assert.equal(safePdfText("e\u0301"), "é");
  assert.equal(safePdfText("før\u0000efter"), "før�efter");
});

test("all Issue 12 PDF fixtures open, span pages, and retain complete text", async () => {
  const fixtures = await generateIssue12Fixtures();
  assert.deepEqual(Object.keys(fixtures).sort(), [
    "agenda",
    "annual-event",
    "annual-matrix",
    "annual-visual",
    "job-card",
    "minutes",
    "tasks",
  ]);

  for (const [name, bytes] of Object.entries(fixtures)) {
    assert.equal(
      Buffer.from(bytes.subarray(0, 5)).toString("ascii"),
      "%PDF-",
      name,
    );
    const extracted = await extractPdf(bytes);
    assert.ok(extracted.pages > 1, `${name} skal have flere sider`);
    assert.match(extracted.text, /ÆØÅ æøå/iu, name);
    assert.match(extracted.text, /✓\s*⚠\s*☕\s*🚀/u, name);
    assert.doesNotMatch(extracted.text, /Ã.|Â·|â€|�/u, name);
    const compactText = extracted.text.replace(/\s+/g, "");
    assert.ok(
      compactText.includes(longUrl.replace(/\s+/g, "")),
      `${name} skal bevare hele den lange URL`,
    );
  }
});

test("fixed timestamps produce deterministic PDF bytes", async () => {
  const generateSamples = async () => [
    await generateMeetingAgendaPdf({
      meeting: {
        title: unicodeMarker,
        starts_at: "2026-08-03T10:15:00.000Z",
        status: "scheduled",
        agenda_item_occurrences: [],
      } as never,
      committeeName: "Testudvalg",
      organizationName: "UX Testorganisation",
      generatedAt: new Date("2026-08-03T10:15:00.000Z"),
    }),
    await generateAnnualWheelMatrixPdf({
      organizationName: "UX Testorganisation",
      overview: {
        year: 2026,
        events: [],
        calendarItems: [],
        committees: [],
        members: [],
      } as never,
      exportedAt: new Date("2026-08-03T10:15:00.000Z"),
    }),
  ];
  const first = await generateSamples();
  const second = await generateSamples();
  for (const [index, bytes] of first.entries()) {
    const firstHash = createHash("sha256").update(bytes).digest("hex");
    const secondHash = createHash("sha256").update(second[index]).digest("hex");
    assert.equal(firstHash, secondHash, `layout ${index + 1}`);
  }
});

test("PDF filenames are safe and include an RFC 5987 Unicode value", () => {
  assert.equal(
    pdfFileSlug("Årsmøde Øst / Æble", "eksport"),
    "aarsmoede-oest-aeble",
  );
  assert.equal(
    pdfContentDisposition("Årsmøde-Øst.pdf"),
    "attachment; filename=\"AArsmoede-OEst.pdf\"; filename*=UTF-8''%C3%85rsm%C3%B8de-%C3%98st.pdf",
  );
  assert.doesNotMatch(pdfContentDisposition("test\r\n.pdf"), /[\r\n]/);
});

test("runtime source and participant UI contain no known mojibake sequences", async () => {
  const files = [
    "apps/mobile/App.tsx",
    "apps/mobile/src/components.tsx",
    "src/components/meetings/meeting-participants-panel.tsx",
    "src/components/meetings/minutes-ai-assistant.tsx",
    "src/lib/email-templates.ts",
    "src/lib/organization-branding.ts",
    "src/services/ai-meeting-overview-service.ts",
    "src/services/task-service.ts",
  ];
  for (const file of files) {
    const source = await readFile(path.join(workspace, file), "utf8");
    assert.doesNotMatch(source, /Ã|Â|â€|â€™|â€“|â€”/u, file);
  }
  const participants = await readFile(
    path.join(
      workspace,
      "src/components/meetings/meeting-participants-panel.tsx",
    ),
    "utf8",
  );
  assert.match(participants, /\.join\(" · "\)/);
  assert.match(participants, /sm:grid-cols/);
});

test("export routes retain their authorized service boundaries", async () => {
  const routeExpectations = new Map<string, RegExp[]>([
    [
      "src/app/api/meetings/[meetingId]/agenda/pdf/route.ts",
      [
        /requireCommitteeMember/,
        /MeetingService\(db\)\.get/,
        /getPdfAttachments/,
      ],
    ],
    [
      "src/app/api/meetings/[meetingId]/minutes/pdf/route.ts",
      [
        /getApprovedPdfData/,
        /getPdfAttachments/,
        /allowReadyForApproval: true/,
      ],
    ],
    [
      "src/app/api/meetings/[meetingId]/tasks/pdf/route.ts",
      [/requireCommitteeMember/, /getMeetingReviewTasks/],
    ],
    ["src/app/api/job-cards/[roleProfileId]/pdf/route.ts", [/getPdfData/]],
    ["src/app/api/annual-wheel/[eventId]/pdf/route.ts", [/getPdfData/]],
    [
      "src/app/api/organizations/[organizationId]/annual-wheel/pdf/overview/route.ts",
      [/requireOrganizationMember/, /getOverview/],
    ],
    [
      "src/app/api/organizations/[organizationId]/annual-wheel/pdf/wheel/route.ts",
      [/requireOrganizationMember/, /getOverview/],
    ],
  ]);

  for (const [file, patterns] of routeExpectations) {
    const source = await readFile(path.join(workspace, file), "utf8");
    assert.match(source, /pdfContentDisposition/);
    for (const pattern of patterns) assert.match(source, pattern, file);
  }
});
