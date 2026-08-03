import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

import { generateMeetingAgendaPdf } from "../../src/lib/agenda-pdf";
import { generateMeetingMinutesPdf } from "../../src/lib/minutes-pdf";
import type { PdfReportBranding } from "../../src/lib/pdf-theme";

const generatedAt = new Date("2026-08-03T10:15:00.000Z");
const marker = "ÆØÅ æøå é ñ Žluťoučký ✓ ⚠ ☕ 🚀";
const url = `https://eksempel.dk/${"ekstraordinært-langt-urlsegment-".repeat(12)}slut`;
const paragraph = `${marker}. ${"Dette lange syntetiske afsnit kontrollerer sideskift, linjeombrydning og komplet tekst uden overlap. ".repeat(24)}${url}`;

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array) {
  const typeBytes = Buffer.from(type, "ascii");
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  Buffer.from(data).copy(result, 8);
  result.writeUInt32BE(
    crc32(Buffer.concat([typeBytes, data])),
    data.length + 8,
  );
  return result;
}

function solidLogo(red: number, green: number, blue: number) {
  const width = 120;
  const height = 44;
  const rows: number[] = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(0);
    for (let x = 0; x < width; x += 1) {
      const mark = x > 12 && x < 34 && y > 10 && y < 34;
      rows.push(mark ? 255 : red, mark ? 255 : green, mark ? 255 : blue, 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      pngChunk("IHDR", header),
      pngChunk("IDAT", deflateSync(Buffer.from(rows))),
      pngChunk("IEND", new Uint8Array()),
    ]),
  );
}

const agendaItems = [
  {
    id: "agenda-transferred",
    item_type: "decision",
    title: `Lang beslutningssag ${marker}`,
    objective: `<p>Formål: ${paragraph}</p>`,
    description: `<p>Baggrund: ${paragraph}</p>`,
  },
  {
    id: "agenda-orientation",
    item_type: "information",
    title: `Orientering og bilag ${marker}`,
    objective: "<p>Skab fælles overblik.</p>",
    description: `<p>${url}</p>`,
  },
];

const meeting = {
  id: "meeting-visual",
  organization_id: "organization-visual",
  committee_id: "committee-visual",
  title: `Bestyrelsesmøde – fælles dokumentdesign ${marker}`,
  description: "<p>Syntetisk visuelt testdokument uden persondata.</p>",
  location: "Mødelokale Øresund",
  starts_at: "2026-08-03T17:30:00.000Z",
  status: "scheduled",
  agenda_item_occurrences: agendaItems.map((item, index) => ({
    id: `occurrence-${index + 1}`,
    position: index + 1,
    agenda_items: item,
  })),
};

const histories = [
  {
    targetAgendaItemId: "agenda-transferred",
    transferReason: "decision_requires_follow_up" as const,
    sourceMeetingTitle: "Strategimøde – juni",
    sourceMeetingDate: "2026-06-15T17:30:00.000Z",
    sourceAgendaItemTitle: "Økonomi, faciliteter og næste skridt",
    previousNotes: `<p>${paragraph}</p>`,
    previousDecision:
      "<p>Beslutningen blev udsat, indtil tre tilbud foreligger.</p>",
    previousFollowUp: "<p>Alex indhenter tilbud senest 1. august 2026.</p>",
    previousDecisions: [
      {
        title: "Afvent tre sammenlignelige tilbud",
        description: "<p>Beslutningen genbehandles på dette møde.</p>",
        deadline: "2026-08-01",
      },
    ],
    previousTasks: [
      {
        title: "Indhent leverandørtilbud",
        description: "<p>Dokumentér pris, levering og garanti.</p>",
        deadline: "2026-08-01",
      },
    ],
  },
];

const themes: Array<{
  slug: string;
  organizationName: string;
  branding?: PdfReportBranding;
}> = [
  {
    slug: "nord",
    organizationName: "UX Organisation Nord",
    branding: {
      organizationName: "UX Organisation Nord",
      primaryColor: "#16425b",
      secondaryColor: "#81c3d7",
      accentColor: "#2f6690",
      fontFamily: "Merriweather",
      logoBytes: solidLogo(22, 66, 91),
      logoMimeType: "image/png",
    },
  },
  {
    slug: "syd",
    organizationName: "UX Organisation Syd",
    branding: {
      organizationName: "UX Organisation Syd",
      primaryColor: "#6b2737",
      secondaryColor: "#f2c14e",
      accentColor: "#d95d39",
      fontFamily: "Montserrat",
      logoBytes: solidLogo(107, 39, 55),
      logoMimeType: "image/png",
    },
  },
  { slug: "neutral", organizationName: "UX Organisation Uden Branding" },
];

async function main() {
  const outputDirectory = path.join(
    process.cwd(),
    "output",
    "pdf",
    "meeting-document-layout",
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const theme of themes) {
    const agenda = await generateMeetingAgendaPdf({
      meeting: meeting as never,
      committeeName: "UX Testudvalg",
      organizationName: theme.organizationName,
      branding: theme.branding,
      transferredHistories: histories,
      generatedAt,
    });
    const minutes = await generateMeetingMinutesPdf({
      meeting: meeting as never,
      committeeName: "UX Testudvalg",
      meetingMinutes: {
        status: "approved",
        minutes_text: "<p>Mødet blev gennemført som planlagt.</p>",
        decisions: "<p>Samlet beslutningsoversigt fremgår af punktkortene.</p>",
      } as never,
      agendaItemMinutes: agendaItems.map((item) => ({
        agenda_item_id: item.id,
        status: "completed",
        notes: `<p>Punktreferat: ${paragraph}</p>`,
        decision: "Beslutningen blev enstemmigt vedtaget.",
        follow_up: "Ansvarlig følger op og rapporterer på næste møde.",
        responsible_user_id: "synthetic-user",
        deadline: "2026-09-01",
      })) as never,
      decisions: [
        {
          id: "decision-visual",
          agenda_item_id: "agenda-transferred",
          title: `Godkend investering ${marker}`,
          description: paragraph,
          status: "active",
          category: "Økonomi",
          responsible_user_id: "synthetic-user",
          responsible: { full_name: "Alex Eksempel" },
          deadline: "2026-09-01",
        },
      ] as never,
      tasks: [
        {
          id: "task-visual",
          agenda_item_id: "agenda-transferred",
          title: `Indhent tre tilbud ${marker}`,
          description: paragraph,
          status: "not_started",
          responsible_user_id: "synthetic-user",
          responsible: { full_name: "Alex Eksempel" },
          deadline: "2026-08-20",
        },
      ] as never,
      approvals: [
        {
          status: "approved",
          responded_at: "2026-08-03T20:00:00.000Z",
          memberName: "Alex Eksempel",
        },
      ] as never,
      attachments: [],
      responsiblePeople: [
        {
          id: "synthetic-user",
          name: "Alex Eksempel",
          email: "alex@example.test",
        },
      ],
      attendeeIds: ["synthetic-user"],
      externalAttendees: [],
      branding: theme.branding ?? { organizationName: theme.organizationName },
      transferredHistories: histories,
      generatedAt,
    });
    await Promise.all([
      writeFile(
        path.join(outputDirectory, `${theme.slug}-dagsorden.pdf`),
        agenda,
      ),
      writeFile(
        path.join(outputDirectory, `${theme.slug}-referat.pdf`),
        minutes,
      ),
    ]);
  }

  process.stdout.write(`${outputDirectory}\n`);
}

void main();
