import {
  agendaItemMinutesStatusLabels,
  agendaItemTypeLabels,
  meetingMinuteApprovalStatusLabels,
} from "@/lib/localization";
import { decisionStatusLabels } from "@/lib/decisions";
import {
  createPdfReport,
  formatPdfDate,
  type PdfReportAttachment,
  type PdfReportBranding,
} from "@/lib/pdf-report";
import { richTextToPdfBlocks, richTextToPlainText } from "@/lib/rich-text";
import { taskStatusLabels } from "@/lib/tasks";
import type {
  AgendaItemMinutes,
  DecisionView,
  MeetingMinuteApprovalView,
  MeetingMinutes,
  MeetingWithAgenda,
  MinuteAttachmentView,
  MinutesResponsiblePerson,
  TaskView,
} from "@/types/domain";

type PdfInput = {
  meeting: MeetingWithAgenda;
  committeeName: string;
  meetingMinutes: MeetingMinutes;
  agendaItemMinutes: AgendaItemMinutes[];
  decisions: DecisionView[];
  tasks: TaskView[];
  approvals: MeetingMinuteApprovalView[];
  attachments: MinuteAttachmentView[];
  attachmentsForPdf?: PdfReportAttachment[];
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

function approvedDate(approvals: MeetingMinuteApprovalView[]) {
  const approvedResponses = approvals
    .filter((approval) => approval.status === "approved" && approval.responded_at)
    .map((approval) => approval.responded_at!)
    .sort();
  return approvedResponses.at(-1) ?? null;
}

type PointDecisionRow = {
  text: string;
  status: string;
  category: string;
  responsible: string;
  deadline: string;
};

type PointFollowUpRow = {
  text: string;
  status: string;
  responsible: string;
  deadline: string;
};

function personName(
  people: MinutesResponsiblePerson[],
  userId: string | null | undefined,
) {
  if (!userId) return "";
  return people.find((person) => person.id === userId)?.name ?? "Ukendt medlem";
}

function compactText(...values: Array<string | null | undefined>) {
  return values
    .map((value) => richTextToPlainText(value).trim())
    .filter(Boolean)
    .join("\n");
}

function pointDecisionRows(
  minutes: AgendaItemMinutes,
  decisions: DecisionView[],
  responsiblePeople: MinutesResponsiblePerson[],
): PointDecisionRow[] {
  const rows = decisions.map((decision) => ({
    text: compactText(decision.title, decision.description),
    status: decisionStatusLabels[decision.status],
    category: decision.category ?? "",
    responsible:
      decision.responsible?.full_name ||
      personName(responsiblePeople, decision.responsible_user_id),
    deadline: decision.deadline ? formatPdfDate(decision.deadline) : "",
  }));
  const legacyDecision = compactText(minutes.decision);
  if (legacyDecision) {
    rows.unshift({
      text: legacyDecision,
      status: agendaItemMinutesStatusLabels[minutes.status],
      category: "",
      responsible: personName(responsiblePeople, minutes.responsible_user_id),
      deadline: minutes.deadline ? formatPdfDate(minutes.deadline) : "",
    });
  }
  return rows;
}

function pointFollowUpRows(
  minutes: AgendaItemMinutes,
  tasks: TaskView[],
  responsiblePeople: MinutesResponsiblePerson[],
): PointFollowUpRow[] {
  const rows = tasks.map((task) => ({
    text: compactText(task.title, task.description),
    status: taskStatusLabels[task.status],
    responsible:
      task.responsible?.full_name ||
      personName(responsiblePeople, task.responsible_user_id),
    deadline: task.deadline ? formatPdfDate(task.deadline) : "",
  }));
  const legacyFollowUp = compactText(minutes.follow_up);
  if (legacyFollowUp) {
    rows.unshift({
      text: legacyFollowUp,
      status: agendaItemMinutesStatusLabels[minutes.status],
      responsible: personName(responsiblePeople, minutes.responsible_user_id),
      deadline: minutes.deadline ? formatPdfDate(minutes.deadline) : "",
    });
  }
  return rows;
}

export async function generateMeetingMinutesPdf(input: PdfInput) {
  const meetingDate = formatPdfDate(input.meeting.starts_at, true);
  const finalApprovalDate = approvedDate(input.approvals);
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

  if (input.meetingMinutes.status === "approved") {
    report.addBadge(
      finalApprovalDate
        ? `Godkendt referat - godkendt ${formatPdfDate(finalApprovalDate)}`
        : "Godkendt referat",
      "success",
    );
  } else if (input.meetingMinutes.status === "ready_for_approval") {
    report.addBadge(
      "Foreløbigt referat - afventer godkendelse",
      "warning",
    );
    report.addParagraph(
      "Dette referat er sendt til godkendelse, men er endnu ikke endeligt godkendt af alle relevante medlemmer.",
    );
  }

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
  const decisionsByAgendaItem = new Map<string, DecisionView[]>();
  const agendaItemIdByDecisionId = new Map<string, string>();
  for (const decision of input.decisions) {
    if (!decision.agenda_item_id) continue;
    const current = decisionsByAgendaItem.get(decision.agenda_item_id) ?? [];
    current.push(decision);
    decisionsByAgendaItem.set(decision.agenda_item_id, current);
    agendaItemIdByDecisionId.set(decision.id, decision.agenda_item_id);
  }
  const tasksByAgendaItem = new Map<string, TaskView[]>();
  for (const task of input.tasks) {
    const agendaItemId =
      task.agenda_item_id ||
      (task.decision_id
        ? agendaItemIdByDecisionId.get(task.decision_id) ?? null
        : null);
    if (!agendaItemId) continue;
    const current = tasksByAgendaItem.get(agendaItemId) ?? [];
    current.push(task);
    tasksByAgendaItem.set(agendaItemId, current);
  }

  for (const [
    occurrenceIndex,
    occurrence,
  ] of input.meeting.agenda_item_occurrences.entries()) {
    const item = occurrence.agenda_items;
    if (!item) continue;
    const minutes = minutesByAgendaItem.get(item.id);

    report.addAgendaItemHeader({
      number: occurrenceIndex + 1,
      typeLabel: agendaItemTypeLabels[item.item_type].short,
      title: item.title,
      subtitle: item.objective || item.description || undefined,
    });
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
    const pointDecisions = pointDecisionRows(
      minutes,
      decisionsByAgendaItem.get(item.id) ?? [],
      input.responsiblePeople,
    );
    const pointFollowUps = pointFollowUpRows(
      minutes,
      tasksByAgendaItem.get(item.id) ?? [],
      input.responsiblePeople,
    );
    if (notes.length) {
      report.addSubsection("Referat");
      report.addProse(notes);
    }
    if (pointDecisions.length) {
      report.addSubsection("Beslutninger");
      report.addTable(
        [
          {
            label: "Beslutning",
            width: 210,
            getValue: (row: PointDecisionRow) => row.text,
          },
          {
            label: "Status",
            width: 70,
            getValue: (row: PointDecisionRow) => row.status,
          },
          {
            label: "Kategori",
            width: 65,
            getValue: (row: PointDecisionRow) => row.category,
          },
          {
            label: "Ansvarlig",
            width: 85,
            getValue: (row: PointDecisionRow) => row.responsible,
          },
          {
            label: "Deadline",
            width: 65,
            getValue: (row: PointDecisionRow) => row.deadline,
          },
        ],
        pointDecisions,
        "",
      );
    }
    if (pointFollowUps.length) {
      report.addSubsection("Opfølgninger");
      report.addTable(
        [
          {
            label: "Opfølgning",
            width: 250,
            getValue: (row: PointFollowUpRow) => row.text,
          },
          {
            label: "Status",
            width: 75,
            getValue: (row: PointFollowUpRow) => row.status,
          },
          {
            label: "Ansvarlig",
            width: 95,
            getValue: (row: PointFollowUpRow) => row.responsible,
          },
          {
            label: "Deadline",
            width: 70,
            getValue: (row: PointFollowUpRow) => row.deadline,
          },
        ],
        pointFollowUps,
        "",
      );
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

  await report.addAttachments(input.attachmentsForPdf ?? []);

  return report.save();
}
