import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";

import {
  generateMeetingAgendaPdf,
  removeDuplicateSectionLabel,
} from "../../src/lib/agenda-pdf";
import { generateAnnualWheelMatrixPdf } from "../../src/lib/annual-wheel-overview-pdf";
import { generateMeetingMinutesPdf } from "../../src/lib/minutes-pdf";
import { pdfContentDisposition, pdfFileSlug } from "../../src/lib/pdf-response";
import { safePdfText } from "../../src/lib/pdf-report";
import { contrastRatio, resolvePdfTheme } from "../../src/lib/pdf-theme";
import { richTextToPdfBlocks } from "../../src/lib/rich-text";
import {
  fixtureDate,
  generateIssue12Fixtures,
  longUrl,
  unicodeMarker,
} from "./pdf-fixtures";

const workspace = process.cwd();
let issue12Fixtures: ReturnType<typeof generateIssue12Fixtures> | undefined;
function getIssue12Fixtures() {
  issue12Fixtures ??= generateIssue12Fixtures();
  return issue12Fixtures;
}

async function extractPdf(bytes: Uint8Array) {
  const loadingTask = getDocument({ data: new Uint8Array(bytes) });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  const overflowingText: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (
        "str" in item &&
        item.str.trim() &&
        item.transform[4] + item.width > page.view[2] - 36
      ) {
        overflowingText.push(`side ${pageNumber}: ${item.str}`);
      }
    }
    pages.push(
      content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
    );
  }
  await document.destroy();
  return {
    pages: document.numPages,
    pageTexts: pages,
    text: pages.join("\n"),
    overflowingText,
  };
}

const minutesFixturePeople = [
  { id: "user-1", name: "Anna Ansvarlig", email: "anna@example.test" },
];

function minutesFixtureInput(overrides: Record<string, unknown> = {}) {
  return {
    meeting: {
      title: "Evaluering af Vorbasse Marked 2026",
      starts_at: "2026-08-19T15:30:00.000Z",
      status: "scheduled",
      agenda_item_occurrences: [],
    } as never,
    committeeName: "Eventudvalget",
    meetingMinutes: {
      status: "approved",
      minutes_text: "",
      decisions: "",
    } as never,
    agendaItemMinutes: [],
    decisions: [],
    tasks: [],
    approvals: [
      {
        status: "approved",
        responded_at: "2026-08-19T18:00:00.000Z",
        memberName: "Anna Ansvarlig",
      } as never,
    ],
    attachments: [],
    responsiblePeople: minutesFixturePeople,
    attendeeIds: [],
    externalAttendees: [],
    branding: { organizationName: "Vorbasse Organisation" },
    generatedAt: fixtureDate,
    ...overrides,
  };
}

test("Unicode text is preserved before PDF layout", () => {
  assert.equal(safePdfText(unicodeMarker), unicodeMarker);
  assert.equal(safePdfText("e\u0301"), "é");
  assert.equal(safePdfText("før\u0000efter"), "før�efter");
});

test("all Issue 12 PDF fixtures open, span pages, and retain complete text", async () => {
  const fixtures = await getIssue12Fixtures();
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
    assert.deepEqual(
      extracted.overflowingText,
      [],
      `${name} har tekst uden for siden`,
    );
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

test("meeting documents share theme resolution with accessible text fallbacks", async () => {
  const firstTheme = resolvePdfTheme({
    primaryColor: "#f7d117",
    secondaryColor: "#29335c",
    accentColor: "#ef476f",
    fontFamily: "Montserrat",
  });
  const secondTheme = resolvePdfTheme({
    primaryColor: "#16425b",
    secondaryColor: "#81c3d7",
    accentColor: "#2f6690",
    fontFamily: "Merriweather",
  });
  const fallbackTheme = resolvePdfTheme();

  assert.notDeepEqual(firstTheme.brand, secondTheme.brand);
  assert.notDeepEqual(firstTheme.secondary, secondTheme.secondary);
  assert.equal(firstTheme.requestedFontFamily, "Montserrat");
  assert.equal(secondTheme.requestedFontFamily, "Merriweather");
  assert.equal(firstTheme.resolvedFontFamily, "Noto Sans");
  assert.equal(fallbackTheme.resolvedFontFamily, "Noto Sans");
  assert.ok(contrastRatio(firstTheme.brandText, firstTheme.brandSoft) >= 4.5);
  assert.ok(contrastRatio(firstTheme.accentText, firstTheme.accentSoft) >= 4.5);

  const meetingInput = {
    title: "Tematest ÆØÅ",
    starts_at: "2026-08-03T10:15:00.000Z",
    status: "scheduled",
    agenda_item_occurrences: [],
  } as never;
  const first = await generateMeetingAgendaPdf({
    meeting: meetingInput,
    committeeName: "Udvalg",
    organizationName: "Organisation A",
    branding: { organizationName: "Organisation A", primaryColor: "#f7d117" },
    generatedAt: fixtureDate,
  });
  const second = await generateMeetingAgendaPdf({
    meeting: meetingInput,
    committeeName: "Udvalg",
    organizationName: "Organisation B",
    branding: { organizationName: "Organisation B", primaryColor: "#16425b" },
    generatedAt: fixtureDate,
  });
  assert.notEqual(
    createHash("sha256").update(first).digest("hex"),
    createHash("sha256").update(second).digest("hex"),
  );
});

test("agenda keeps only compact transfer context while minutes retain complete history", async () => {
  const fixtures = await getIssue12Fixtures();
  const agenda = await extractPdf(fixtures.agenda);
  assert.match(agenda.text, /Overført fra/u);
  assert.match(agenda.text, /Tidligere møde[\s\S]*15\.06\.2026/u);
  assert.match(agenda.text, /Årsag[\s\S]*Kræver opfølgning/u);
  assert.doesNotMatch(agenda.text, /Tidligere noter\/referat/u);
  assert.doesNotMatch(agenda.text, /Tidligere beslutning/u);
  assert.doesNotMatch(agenda.text, /Tidligere opfølgning/u);
  assert.doesNotMatch(agenda.text, /Tidligere relaterede beslutninger/u);
  assert.doesNotMatch(agenda.text, /Tidligere relaterede opgaver/u);

  const minutes = await extractPdf(fixtures.minutes);
  assert.match(minutes.text, /Overført fra tidligere møde/u);
  assert.match(minutes.text, /Tidligere noter\/referat/u);
  assert.match(minutes.text, /Tidligere beslutning/u);
  assert.match(minutes.text, /Tidligere opfølgning/u);
  assert.match(minutes.text, /Tidligere relaterede beslutninger/u);
  assert.match(minutes.text, /Tidligere relaterede opgaver/u);
  assert.match(minutes.text, /\(fortsat\)/u);

  for (const [name, extracted] of [
    ["agenda", agenda],
    ["minutes", minutes],
  ] as const) {
    assert.ok(
      extracted.text.match(/Side \d+/gu)?.length === extracted.pages,
      `${name} skal have footer og sidetal på alle sider`,
    );
  }
});

test("agenda PDF removes only an identical first section-label line", async () => {
  for (const label of ["Formål", "Baggrund", "Beslutning", "Opfølgning"]) {
    const blocks = removeDuplicateSectionLabel(
      label,
      richTextToPdfBlocks(`<p>  ${label}  </p><p>Aktuelt indhold</p>`),
    );
    assert.deepEqual(
      blocks.map((block) => block.text),
      ["Aktuelt indhold"],
    );
    assert.equal(
      removeDuplicateSectionLabel(
        label,
        richTextToPdfBlocks(`<p>${label} for mødet</p>`),
      )[0]?.text,
      `${label} for mødet`,
    );
  }

  const pdf = await generateMeetingAgendaPdf({
    meeting: {
      title: "Kompakt dagsorden",
      starts_at: "2026-08-03T10:15:00.000Z",
      status: "scheduled",
      agenda_item_occurrences: [
        {
          agenda_items: {
            id: "agenda-labels",
            item_type: "decision",
            title: "Aktuelt punkt",
            objective: "<p>Formål</p><p>Aktuelt formål</p>",
            description: "<p>Baggrund</p><p>Aktuel baggrund</p>",
          },
        },
      ],
    } as never,
    committeeName: "Udvalg",
    organizationName: "Organisation",
    generatedAt: fixtureDate,
  });
  const extracted = await extractPdf(pdf);
  assert.equal(extracted.text.match(/Formål/gu)?.length, 1);
  assert.equal(extracted.text.match(/Baggrund/gu)?.length, 1);
  assert.match(extracted.text, /Aktuelt formål/u);
  assert.match(extracted.text, /Aktuel baggrund/u);
});

test("rich text keeps paragraphs, inline emphasis, and nested list structure", () => {
  const blocks = richTextToPdfBlocks(`
    <p>Indledning med <strong>fed</strong> og <em>kursiv</em> tekst.<br>Ny linje.</p>
    <ul>
      <li><p>Første punkt</p><ul><li>Indlejret punkt</li></ul></li>
      <li>Andet punkt</li>
    </ul>
    <ol><li>Første nummer</li><li>Andet nummer</li></ol>
  `);

  assert.equal(blocks[0]?.type, "paragraph");
  assert.match(blocks[0]?.text ?? "", /Indledning[\s\S]*Ny linje/u);
  assert.deepEqual(
    blocks[0]?.runs?.filter((run) => run.bold || run.italic),
    [
      { text: "fed", bold: true, italic: undefined },
      { text: "kursiv", bold: undefined, italic: true },
    ],
  );
  assert.deepEqual(
    blocks.slice(1).map(({ type, text, ordered, index, depth }) => ({
      type,
      text,
      ordered,
      index,
      depth,
    })),
    [
      { type: "listItem", text: "Første punkt", ordered: false, index: undefined, depth: 0 },
      { type: "listItem", text: "Indlejret punkt", ordered: false, index: undefined, depth: 1 },
      { type: "listItem", text: "Andet punkt", ordered: false, index: undefined, depth: 0 },
      { type: "listItem", text: "Første nummer", ordered: true, index: 1, depth: 0 },
      { type: "listItem", text: "Andet nummer", ordered: true, index: 2, depth: 0 },
    ],
  );
});

test("minutes PDF renders rich text lists in general and agenda-item fields", async () => {
  const longListItem = "Et meget langt punkt med korrekt wrapping. ".repeat(120);
  const pdf = await generateMeetingMinutesPdf(
    minutesFixtureInput({
      meetingMinutes: {
        status: "approved",
        minutes_text: `<p>Generelt afsnit</p><ul><li>${longListItem}</li><li>Generelt punkt to</li></ul>`,
        decisions: "<ol><li><strong>Første beslutning</strong></li><li>Anden beslutning</li></ol>",
      } as never,
      meeting: {
        title: "Rich text-test",
        starts_at: "2026-08-19T15:30:00.000Z",
        status: "scheduled",
        agenda_item_occurrences: [
          {
            agenda_items: {
              id: "rich-item",
              item_type: "discussion",
              title: "Rich text-punkt",
              objective: "<ul><li>Formålspunkt</li></ul>",
              description: "<ol><li>Baggrundspunkt</li></ol>",
            },
          },
        ],
      } as never,
      agendaItemMinutes: [
        {
          agenda_item_id: "rich-item",
          status: "completed",
          notes: "<ul><li>Referatspunkt</li></ul>",
          decision: "",
          follow_up: "",
          responsible_user_id: null,
          deadline: null,
        },
      ] as never,
    }),
  );
  const extracted = await extractPdf(pdf);
  assert.ok(extracted.pages > 1);
  assert.deepEqual(extracted.overflowingText, []);
  assert.match(extracted.text, /-\s*Generelt punkt to/u);
  assert.match(extracted.text, /1\.\s*Første beslutning/u);
  assert.match(extracted.text, /2\.\s*Anden beslutning/u);
  assert.match(extracted.text, /-\s*Formålspunkt/u);
  assert.match(extracted.text, /1\.\s*Baggrundspunkt/u);
  assert.match(extracted.text, /-\s*Referatspunkt/u);
});

test("minutes omit empty sections and retain agenda headers, statuses, and attachment list", async () => {
  const agendaItems = [
    {
      id: "item-1",
      item_type: "decision",
      title: "Godkendelse af dagsorden",
      objective: "",
      description: "",
    },
    {
      id: "item-2",
      item_type: "discussion",
      title: "Evaluering af vagtplaner",
      objective: "Formål\nEt fælles billede af vagtplanen.",
      description: "",
    },
  ];
  const pdf = await generateMeetingMinutesPdf(
    minutesFixtureInput({
      meeting: {
        title: "Evaluering af Vorbasse Marked 2026",
        starts_at: "2026-08-19T15:30:00.000Z",
        status: "scheduled",
        agenda_item_occurrences: agendaItems.map((agenda_items, index) => ({
          position: index,
          agenda_items,
        })),
      } as never,
      agendaItemMinutes: [
        {
          agenda_item_id: "item-2",
          status: "completed",
          notes: "",
          decision: "",
          follow_up: "",
          responsible_user_id: null,
          deadline: null,
        },
      ] as never,
      attachments: [
        {
          fileName: "Vagtplan.pdf",
          mimeType: "application/pdf",
          uploadedByName: "Anna Ansvarlig",
        } as never,
      ],
    }),
  );
  const extracted = await extractPdf(pdf);
  assert.doesNotMatch(extracted.text, /Generelt referat/u);
  assert.doesNotMatch(extracted.text, /Der er ingen referattekst/u);
  assert.doesNotMatch(extracted.text, /Der er ingen samlede beslutninger/u);
  assert.doesNotMatch(extracted.text, /Der er ikke gemt et punktreferat/u);
  assert.equal(extracted.text.match(/Formål/gu)?.length, 1);
  assert.match(extracted.text, /1\. \(B\) Godkendelse af dagsorden/u);
  assert.match(extracted.text, /2\. \(D\) Evaluering af vagtplaner/u);
  assert.match(extracted.text, /Drøftelse/u);
  assert.match(extracted.text, /Godkendelsesstatus/u);
  assert.match(extracted.text, /1 af 1 har godkendt/u);
  assert.match(extracted.text, /Vedhæftninger/u);
  assert.match(extracted.text, /Vagtplan\.pdf/u);
});

test("minutes keep a non-empty general narrative without an orphan decisions label", async () => {
  const pdf = await generateMeetingMinutesPdf(
    minutesFixtureInput({
      meetingMinutes: {
        status: "approved",
        minutes_text: "Mødet blev gennemført som planlagt.",
        decisions: "",
      } as never,
    }),
  );
  const extracted = await extractPdf(pdf);
  assert.match(extracted.text, /Generelt referat/u);
  assert.match(extracted.text, /Referat[\s\S]*Mødet blev gennemført/u);
  assert.doesNotMatch(extracted.text, /Beslutninger/u);
  assert.doesNotMatch(extracted.text, /Der er ingen samlede beslutninger/u);
});

test("agenda-item starts keep the first block and long items use light continuation headers", async () => {
  const filler = "Lang evalueringstekst. ".repeat(180);
  const items = [
    {
      id: "long-1",
      item_type: "discussion",
      title: "Evaluering af afviklingen",
      objective: filler,
      description: "",
    },
    {
      id: "item-3",
      item_type: "discussion",
      title: "Evaluering af opsætning",
      objective: "At drøfte den praktiske del af opsætningen på pladsen.",
      description: "",
    },
  ];
  const pdf = await generateMeetingMinutesPdf(
    minutesFixtureInput({
      meeting: {
        title: "Evaluering af Vorbasse Marked 2026",
        starts_at: "2026-08-19T15:30:00.000Z",
        status: "scheduled",
        agenda_item_occurrences: items.map((agenda_items, index) => ({
          position: index,
          agenda_items,
        })),
      } as never,
    }),
  );
  const extracted = await extractPdf(pdf);
  assert.match(extracted.text, /1\. Evaluering af afviklingen · fortsat/u);
  assert.doesNotMatch(extracted.text, /Evaluering af afviklingen \(fortsat\)/u);
  const itemStartPage = extracted.pageTexts.find(
    (pageText) =>
      pageText.includes("2. (D) Evaluering af opsætning") &&
      pageText.includes("At drøfte den praktiske del af opsætningen"),
  );
  assert.ok(itemStartPage, "punkt-header og første Formål-blok skal følges ad");
});

test("standard minutes list attachments while complete export appends PDF and image pages", async () => {
  const sourcePdf = await PDFDocument.create();
  sourcePdf.addPage([120, 120]);
  const pdfBytes = await sourcePdf.save();
  const pngBytes = new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const attachments = [
    {
      fileName: "Evaluering.pdf",
      mimeType: "application/pdf",
      uploadedByName: "Anna Ansvarlig",
    } as never,
    {
      fileName: "Markedsprogram.png",
      mimeType: "image/png",
      uploadedByName: "Anna Ansvarlig",
    } as never,
  ];
  const standard = await generateMeetingMinutesPdf(
    minutesFixtureInput({ attachments }),
  );
  const complete = await generateMeetingMinutesPdf(
    minutesFixtureInput({
      attachments,
      attachmentsForPdf: [
        {
          appendixNumber: 1,
          pointLabel: "Møde",
          fileName: "Evaluering.pdf",
          mimeType: "application/pdf",
          bytes: pdfBytes,
          embedType: "pdf",
        },
        {
          appendixNumber: 2,
          pointLabel: "Punkt 2",
          fileName: "Markedsprogram.png",
          mimeType: "image/png",
          bytes: pngBytes,
          embedType: "png",
        },
      ],
    }),
  );
  const [standardText, completeText] = await Promise.all([
    extractPdf(standard),
    extractPdf(complete),
  ]);
  assert.match(standardText.text, /Evaluering\.pdf/u);
  assert.match(standardText.text, /Markedsprogram\.png/u);
  assert.doesNotMatch(standardText.text, /Bilag 1 - Møde/u);
  assert.match(completeText.text, /Bilag 1 - Møde: Evaluering\.pdf/u);
  assert.match(completeText.text, /Bilag 2 - Punkt 2: Markedsprogram\.png/u);
  assert.ok(completeText.pages > standardText.pages);
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
        /listPdfHistoryForMeeting/,
      ],
    ],
    [
      "src/app/api/meetings/[meetingId]/minutes/pdf/route.ts",
      [
        /getApprovedPdfData/,
        /getPdfAttachments/,
        /allowReadyForApproval: true/,
        /listPdfHistoryForMeeting/,
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

  const transferService = await readFile(
    path.join(workspace, "src/services/transferred-agenda-item-service.ts"),
    "utf8",
  );
  assert.match(transferService, /requireCommitteeMember/);
  assert.match(transferService, /organization_id !== organizationId/);
  assert.match(transferService, /committee_id !== committeeId/);

  const transferRepository = await readFile(
    path.join(
      workspace,
      "src/repositories/transferred-agenda-item-repository.ts",
    ),
    "utf8",
  );
  assert.match(transferRepository, /select\("id,notes,decision,follow_up"\)/);
  assert.doesNotMatch(transferRepository, /agenda_item_private_notes/);

  const minutesRoute = await readFile(
    path.join(
      workspace,
      "src/app/api/meetings/[meetingId]/minutes/pdf/route.ts",
    ),
    "utf8",
  );
  assert.match(minutesRoute, /includeAttachments.*=== "1"/u);
  assert.match(
    minutesRoute,
    /includeAttachments\s*\?\s*service\.getPdfAttachments/u,
  );
  assert.match(minutesRoute, /Promise\.resolve\(\[\]\)/u);

  const minutesGovernance = await readFile(
    path.join(workspace, "src/components/meetings/minutes-governance.tsx"),
    "utf8",
  );
  assert.match(minutesGovernance, /Download referat/u);
  assert.match(minutesGovernance, /Download referat inkl\. bilag/u);
  assert.match(minutesGovernance, /includeAttachments=1/u);
});
