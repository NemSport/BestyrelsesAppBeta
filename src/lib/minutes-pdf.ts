import {
  agendaItemMinutesStatusLabels,
  agendaItemTypeLabels,
  meetingMinuteApprovalStatusLabels,
} from "@/lib/localization";
import {
  createPdfReport,
  formatPdfDate,
  type PdfReportBranding,
} from "@/lib/pdf-report";
import { richTextToPdfBlocks } from "@/lib/rich-text";
import type {
  AgendaItemMinutes,
  MeetingMinuteApprovalView,
  MeetingMinutes,
  MeetingWithAgenda,
  MinuteAttachmentView,
  MinutesResponsiblePerson,
} from "@/types/domain";

type PdfInput = {
  meeting: MeetingWithAgenda;
  committeeName: string;
  meetingMinutes: MeetingMinutes;
  agendaItemMinutes: AgendaItemMinutes[];
  approvals: MeetingMinuteApprovalView[];
  attachments: MinuteAttachmentView[];
  responsiblePeople: MinutesResponsiblePerson[];
  attendeeIds: string[];
  branding?: PdfReportBranding;
};

function approvalSummary(approvals: MeetingMinuteApprovalView[]) {
  const approved = approvals.filter((approval) => approval.status === "approved")
    .length;
  const changeRequests = approvals.filter(
    (approval) => approval.status === "change_requested",
  ).length;
  if (!approvals.length) return "Ingen godkendelsesrunde";
  return `${approved} af ${approvals.length} har godkendt${
    changeRequests ? ` · ${changeRequests} ønsker ændringer` : ""
  }`;
}

function statusTone(status: MeetingMinuteApprovalView["status"]) {
  if (status === "approved") return "success" as const;
  if (status === "change_requested") return "warning" as const;
  if (status === "no_response") return "danger" as const;
  return "neutral" as const;
}

export async function generateMeetingMinutesPdf(input: PdfInput) {
  const meetingDate = formatPdfDate(input.meeting.starts_at, true);
  const report = await createPdfReport({
    documentType: "Mødereferat",
    title: input.meeting.title,
    subtitle: meetingDate,
    organizationName: input.branding?.organizationName,
    committeeName: input.committeeName,
    generatedAt: new Date(),
    branding: input.branding,
    meta: [
      { label: "Organisation", value: input.branding?.organizationName ?? "" },
      { label: "Udvalg", value: input.committeeName },
      { label: "Mødedato", value: meetingDate },
      {
        label: "Referatstatus",
        value:
          input.meetingMinutes.status === "approved"
            ? "Godkendt"
            : input.meetingMinutes.status === "ready_for_approval"
              ? "Klar til godkendelse"
              : "Kladde",
      },
      { label: "Godkendelse", value: approvalSummary(input.approvals) },
    ],
  });

  const attendeeNames = input.attendeeIds
    .map((id) => input.responsiblePeople.find((person) => person.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  if (attendeeNames.length > 0) {
    report.addSection("Deltagere");
    report.addParagraph(attendeeNames.join(", "));
  }

  report.addSection("Generelt referat");
  report.addSubsection("Referattekst");
  report.addProse(
    richTextToPdfBlocks(input.meetingMinutes.minutes_text),
    "Der er ingen referattekst.",
  );
  report.addSubsection("Beslutninger");
  report.addProse(
    richTextToPdfBlocks(input.meetingMinutes.decisions),
    "Der er ingen samlede beslutninger.",
  );

  report.addSection("Dagsorden og punktreferater");
  const minutesByAgendaItem = new Map(
    input.agendaItemMinutes.map((minutes) => [minutes.agenda_item_id, minutes]),
  );

  for (const occurrence of input.meeting.agenda_item_occurrences) {
    const item = occurrence.agenda_items;
    if (!item) continue;
    const minutes = minutesByAgendaItem.get(item.id);
    const itemTitle = `${occurrence.position + 1}. (${
      agendaItemTypeLabels[item.item_type].short
    }) ${item.title}`;

    report.addSubsection(itemTitle);
    if (!minutes) {
      report.addParagraph("Der er ikke gemt et punktreferat.");
      continue;
    }

    report.addBadge(agendaItemMinutesStatusLabels[minutes.status]);
    const responsible = minutes.responsible_user_id
      ? input.responsiblePeople.find(
          (person) => person.id === minutes.responsible_user_id,
        )
      : null;
    report.addMetaGrid([
      {
        label: "Ansvarlig",
        value: responsible?.name ?? (minutes.responsible_user_id ? "Ukendt medlem" : ""),
      },
      { label: "Deadline", value: minutes.deadline ?? "" },
    ]);

    const notes = richTextToPdfBlocks(minutes.notes);
    const decision = richTextToPdfBlocks(minutes.decision);
    const followUp = richTextToPdfBlocks(minutes.follow_up);
    if (notes.length) {
      report.addSubsection("Noter");
      report.addProse(notes);
    }
    if (decision.length) {
      report.addSubsection("Beslutning");
      report.addProse(decision);
    }
    if (followUp.length) {
      report.addSubsection("Opfølgning");
      report.addProse(followUp);
    }
  }

  report.addSection("Godkendelsesstatus");
  for (const approval of input.approvals) {
    report.addBadge(
      `${approval.memberName}: ${meetingMinuteApprovalStatusLabels[approval.status]}`,
      statusTone(approval.status),
    );
    if (approval.comment) {
      report.addParagraph(`Kommentar: ${approval.comment}`);
    }
  }
  if (!input.approvals.length) {
    report.addParagraph("Der er ikke registreret godkendelser.");
  }

  report.addSection("Vedhæftninger");
  report.addTable(
    [
      {
        label: "Filnavn",
        width: 220,
        getValue: (attachment: MinuteAttachmentView) => attachment.fileName,
      },
      {
        label: "Filtype",
        width: 120,
        getValue: (attachment: MinuteAttachmentView) => attachment.mimeType,
      },
      {
        label: "Uploadet af",
        width: 160,
        getValue: (attachment: MinuteAttachmentView) =>
          attachment.uploadedByName,
      },
    ],
    input.attachments,
    "Ingen vedhæftninger.",
  );

  return report.save();
}
