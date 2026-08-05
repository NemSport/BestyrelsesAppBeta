import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  generateMeetingTasklistPdf,
  getTaskDeadlinePdfBadge,
  getTaskStatusPdfBadge,
} from "../../src/lib/meeting-tasklist-pdf";
import type { MeetingReviewTask } from "../../src/services/task-service";

const generatedAt = new Date("2026-08-05T10:00:00.000Z");

const longNote =
  "Lang seneste note med æ, ø og å samt ✓ ⚠ ☕ 🚀. " +
  "Opfølgningen beskriver ansvar, afhængigheder og næste skridt uden afkortning. ".repeat(
    8,
  ) +
  "https://example.test/organisation/udvalg/opgaver/meget-lang-reference-uden-mellemrum-abcdefghijklmnopqrstuvwxyz0123456789";

function task(
  index: number,
  overrides: Record<string, unknown> = {},
): MeetingReviewTask {
  return {
    id: `task-${index}`,
    organization_id: "org-test",
    committee_id: "committee-test",
    meeting_id: "meeting-test",
    agenda_item_id: null,
    decision_id: null,
    title: `Opgave ${String(index).padStart(2, "0")} – dansk prøvetitel med ÆØÅ`,
    description: "Syntetisk testbeskrivelse",
    responsible_user_id: index % 5 === 0 ? null : `user-${index}`,
    status: ["not_started", "in_progress", "waiting", "completed"][index % 4],
    deadline:
      index % 6 === 0
        ? null
        : index % 4 === 3
          ? "2026-07-01"
          : index % 3 === 0
            ? "2026-08-09"
            : "2026-07-28",
    completed_at: index % 4 === 3 ? "2026-08-01T10:00:00.000Z" : null,
    sort_order: index,
    created_by: "user-admin",
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    committee: null,
    meeting: null,
    agendaItem: null,
    decision: null,
    responsible:
      index % 5 === 0
        ? null
        : {
            id: `user-${index}`,
            full_name: `Ansvarlig ${index}`,
            email: `ansvarlig${index}@example.test`,
          },
    reviewSource: index % 2 === 0 ? "Dagsordenspunkt 2" : "Beslutning 4",
    latestComment: {
      id: `comment-${index}`,
      task_id: `task-${index}`,
      organization_id: "org-test",
      committee_id: "committee-test",
      author_id: "user-admin",
      body: index % 3 === 0 ? longNote : `${longNote.slice(0, 300)} #${index}`,
      created_at: "2026-08-02T10:00:00.000Z",
      updated_at: "2026-08-02T10:00:00.000Z",
      author: null,
    },
    ...overrides,
  } as never;
}

async function extractPages(bytes: Uint8Array) {
  const loadingTask = getDocument({ data: new Uint8Array(bytes) });
  const document = await loadingTask.promise;
  const pages: Array<{ text: string; width: number; height: number }> = [];
  const overflowingText: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    for (const item of content.items) {
      if (
        "str" in item &&
        item.str.trim() &&
        item.transform[4] + item.width > page.view[2] - 36
      ) {
        overflowingText.push(`side ${pageNumber}: ${item.str}`);
      }
    }
    pages.push({ text, width: page.view[2], height: page.view[3] });
  }

  await document.destroy();
  return { pages, overflowingText };
}

test("task status and deadline badges use the requested semantic tones", () => {
  assert.deepEqual(getTaskStatusPdfBadge("not_started"), {
    label: "Ikke påbegyndt",
    tone: "neutral",
  });
  assert.deepEqual(getTaskStatusPdfBadge("in_progress"), {
    label: "I gang",
    tone: "progress",
  });
  assert.deepEqual(getTaskStatusPdfBadge("waiting"), {
    label: "Afventer",
    tone: "warning",
  });
  assert.deepEqual(getTaskStatusPdfBadge("blocked"), {
    label: "Blokeret",
    tone: "orange",
  });
  assert.deepEqual(getTaskStatusPdfBadge("completed"), {
    label: "Færdig",
    tone: "success",
  });

  assert.deepEqual(getTaskDeadlinePdfBadge(task(1), generatedAt), {
    label: "Overskredet",
    tone: "danger",
  });
  assert.deepEqual(getTaskDeadlinePdfBadge(task(9), generatedAt), {
    label: "Forfalder snart",
    tone: "warning",
  });
  assert.deepEqual(getTaskDeadlinePdfBadge(task(6), generatedAt), {
    label: "Ingen deadline",
    tone: "neutral",
  });
  assert.equal(
    getTaskDeadlinePdfBadge(
      task(7, { status: "completed", deadline: "2026-07-01" }),
      generatedAt,
    ),
    null,
    "færdige opgaver må ikke markeres som overskredet",
  );
});

test("large task list is landscape, complete, paginated, and repeats headers", async () => {
  const tasks = Array.from({ length: 28 }, (_, index) =>
    task(index + 1, index === 1 ? { status: "blocked" } : {}),
  );
  const bytes = await generateMeetingTasklistPdf({
    meeting: {
      id: "meeting-test",
      title: "Bestyrelsesmøde – opgaveliste ÆØÅ",
      starts_at: "2026-08-10T17:30:00.000Z",
      status: "scheduled",
      agenda_item_occurrences: [],
    } as never,
    organizationName: "UX Testorganisation",
    committeeName: "Test udvalg",
    tasks,
    generatedAt,
  });

  if (process.env.TASK_PDF_OUTPUT) {
    const outputPath = path.resolve(process.env.TASK_PDF_OUTPUT);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes);
  }

  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("ascii"), "%PDF-");
  const extracted = await extractPages(bytes);
  assert.ok(extracted.pages.length >= 4, "fixture skal give en flersidet PDF");
  assert.deepEqual(extracted.overflowingText, []);

  for (const [index, page] of extracted.pages.entries()) {
    assert.ok(
      page.width > page.height,
      `side ${index + 1} skal være landscape`,
    );
    if (index > 0) {
      assert.match(
        page.text,
        /Opgave/u,
        `tabelheader mangler på side ${index + 1}`,
      );
      assert.match(
        page.text,
        /Seneste note/u,
        `gentaget tabelheader mangler på side ${index + 1}`,
      );
    }
    assert.ok(
      page.text.replace(/\s+/g, " ").length > 250,
      `side ${index + 1} må ikke være næsten tom`,
    );
  }

  const allText = extracted.pages.map((page) => page.text).join("\n");
  assert.match(allText, /Ikke påbegyndt/u);
  assert.match(allText, /I gang/u);
  assert.match(allText, /Afventer/u);
  assert.match(allText, /Blokeret/u);
  assert.match(allText, /Færdig/u);
  assert.match(allText, /Overskredet/u);
  assert.match(allText, /Forfalder snart/u);
  assert.match(allText, /Ingen deadline/u);
  assert.match(allText, /Mangler/u);
  assert.match(allText, /ÆØÅ/u);
  assert.match(allText, /✓\s*⚠\s*☕\s*🚀/u);
  assert.match(
    allText.replace(/\s+/g, ""),
    /abcdefghijklmnopqrstuvwxyz0123456789/u,
  );

  for (const taskItem of tasks) {
    assert.match(allText, new RegExp(`Opgave ${taskItem.title.slice(7, 9)}`));
  }
});
