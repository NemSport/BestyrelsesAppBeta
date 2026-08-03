import { agendaItemTransferReasonLabels } from "@/lib/localization";
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
