import { agendaItemTransferReasonLabels } from "@/lib/localization";
import { formatDanishDate } from "@/lib/date-format";
import { formatPdfDate } from "@/lib/pdf-report";
import type { PdfProseBlock } from "@/lib/pdf-report";
import { richTextToPdfBlocks, richTextToPlainText } from "@/lib/rich-text";
import type { Database } from "@/types/database";

export type PdfTransferredAgendaItemHistory = {
  targetAgendaItemId: string;
  transferReason: Database["public"]["Enums"]["agenda_item_transfer_reason"];
  sourceMeetingTitle: string;
  sourceMeetingDate: string;
  sourceAgendaItemTitle: string;
  previousNotes: string;
  previousDecision: string;
  previousFollowUp: string;
  previousDecisions?: Array<{
    title: string;
    description: string;
    deadline: string | null;
  }>;
  previousTasks?: Array<{
    title: string;
    description: string;
    deadline: string | null;
  }>;
};

type MeetingDocumentReport = {
  beginInformationBox: (title: string) => void;
  endInformationBox: () => void;
  addSubsection: (title: string) => void;
  addParagraph: (text: string) => void;
  addProse: (blocks: PdfProseBlock[], emptyText?: string) => void;
};

function normalizedSectionLine(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("da-DK");
}

export function removeDuplicatePdfSectionLabel(
  label: string,
  blocks: PdfProseBlock[],
) {
  const [first, ...rest] = blocks;
  if (!first) return blocks;

  const lineEnd = first.text.indexOf("\n");
  const firstLine = lineEnd === -1 ? first.text : first.text.slice(0, lineEnd);
  if (normalizedSectionLine(firstLine) !== normalizedSectionLine(label)) {
    return blocks;
  }
  if (lineEnd === -1) return rest;

  let contentStart = lineEnd + 1;
  while (/\s/u.test(first.text[contentStart] ?? "")) contentStart += 1;
  if (contentStart >= first.text.length) return rest;

  let remaining = contentStart;
  const runs = first.runs?.flatMap((run) => {
    if (remaining >= run.text.length) {
      remaining -= run.text.length;
      return [];
    }
    const text = run.text.slice(remaining);
    remaining = 0;
    return text ? [{ ...run, text }] : [];
  });
  return [{ ...first, text: first.text.slice(contentStart), runs }, ...rest];
}

export function addTransferredAgendaItemHistory(
  report: MeetingDocumentReport,
  history: PdfTransferredAgendaItemHistory,
) {
  report.beginInformationBox("Overført fra tidligere møde");
  report.addSubsection("Tidligere møde");
  report.addParagraph(
    `${history.sourceMeetingTitle} · ${formatPdfDate(history.sourceMeetingDate)}`,
  );
  report.addSubsection("Tidligere punkt");
  report.addParagraph(history.sourceAgendaItemTitle);
  report.addSubsection("Årsag til overførsel");
  report.addParagraph(agendaItemTransferReasonLabels[history.transferReason]);

  const sections = [
    ["Tidligere noter/referat", history.previousNotes],
    ["Tidligere beslutning", history.previousDecision],
    ["Tidligere opfølgning", history.previousFollowUp],
  ] as const;
  for (const [title, value] of sections) {
    const blocks = richTextToPdfBlocks(value);
    if (!blocks.length) continue;
    report.addSubsection(title);
    report.addProse(blocks);
  }
  const relatedSections = [
    ["Tidligere relaterede beslutninger", history.previousDecisions ?? []],
    ["Tidligere relaterede opgaver", history.previousTasks ?? []],
  ] as const;
  for (const [title, values] of relatedSections) {
    if (!values.length) continue;
    report.addSubsection(title);
    for (const value of values) {
      const description = richTextToPlainText(value.description).trim();
      const deadline = value.deadline
        ? ` · deadline ${formatPdfDate(value.deadline)}`
        : "";
      report.addParagraph(
        `• ${value.title}${description ? ` – ${description}` : ""}${deadline}`,
      );
    }
  }
  report.endInformationBox();
}

export function addTransferredAgendaItemSummary(
  report: MeetingDocumentReport,
  history: PdfTransferredAgendaItemHistory,
) {
  report.beginInformationBox("Overført punkt");
  report.addSubsection("Overført fra");
  report.addParagraph(
    `${history.sourceMeetingTitle} (${formatDanishDate(history.sourceMeetingDate, "short")})`,
  );
  report.addSubsection("Årsag");
  report.addParagraph(agendaItemTransferReasonLabels[history.transferReason]);
  report.endInformationBox();
}
