import { getAgendaItemTypeLabel, meetingStatusLabels } from "@/lib/localization";
import {
  createPdfReport,
  formatPdfDate,
  type PdfReportBranding,
  type PdfReportAttachment,
} from "@/lib/pdf-report";
import { richTextToPdfBlocks } from "@/lib/rich-text";
import type { MeetingWithAgenda } from "@/types/domain";

type PdfInput = {
  meeting: MeetingWithAgenda;
  committeeName: string;
  organizationName: string;
  branding?: PdfReportBranding;
  attachments?: PdfReportAttachment[];
};

export async function generateMeetingAgendaPdf(input: PdfInput) {
  const meetingDate = formatPdfDate(input.meeting.starts_at, true);
  const report = await createPdfReport({
    documentType: "Dagsorden",
    title: input.meeting.title,
    subtitle: meetingDate,
    organizationName: input.organizationName,
    committeeName: input.committeeName,
    generatedAt: new Date(),
    branding: input.branding,
    meta: [
      { label: "Organisation", value: input.organizationName },
      { label: "Udvalg", value: input.committeeName },
      { label: "Mødedato", value: meetingDate },
      { label: "Sted", value: input.meeting.location ?? "" },
      { label: "Status", value: meetingStatusLabels[input.meeting.status] },
    ],
  });

  if (input.meeting.description) {
    report.addSection("Mødebeskrivelse");
    report.addProse(richTextToPdfBlocks(input.meeting.description));
  }

  report.addSection("Dagsordenspunkter");

  if (!input.meeting.agenda_item_occurrences.length) {
    report.addParagraph("Der er endnu ikke oprettet dagsordenspunkter.");
  }

  for (const [
    occurrenceIndex,
    occurrence,
  ] of input.meeting.agenda_item_occurrences.entries()) {
    const item = occurrence.agenda_items;
    if (!item) continue;
    const typeLabel = getAgendaItemTypeLabel(item.item_type);
    report.addAgendaItemHeader({
      number: occurrenceIndex + 1,
      typeLabel: typeLabel.short,
      title: item.title,
      subtitle: typeLabel.label,
    });

    const objectiveBlocks = richTextToPdfBlocks(item.objective);
    const descriptionBlocks = richTextToPdfBlocks(item.description);

    if (objectiveBlocks.length) {
      report.addSubsection("Formål");
      report.addProse(objectiveBlocks);
    }
    if (descriptionBlocks.length) {
      report.addSubsection("Baggrund");
      report.addProse(descriptionBlocks);
    }
  }

  await report.addAttachments(input.attachments ?? []);

  return report.save();
}
