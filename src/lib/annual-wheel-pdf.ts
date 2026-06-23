import {
  annualWheelPriorityLabels,
  annualWheelRecurrenceLabels,
} from "@/lib/annual-wheel";
import {
  createPdfReport,
  formatPdfDate,
  type PdfReportBranding,
} from "@/lib/pdf-report";
import { richTextToPdfBlocks, richTextToPlainText } from "@/lib/rich-text";
import type {
  AnnualWheelEventView,
  OrganizationMemberDirectoryEntry,
} from "@/types/domain";

type AnnualWheelPdfInput = {
  organizationName: string;
  event: AnnualWheelEventView;
  members: OrganizationMemberDirectoryEntry[];
  exportedAt: Date;
  branding?: PdfReportBranding;
};

const eventStatusLabels: Record<AnnualWheelEventView["status"], string> = {
  planned: "Planlagt",
  in_progress: "I gang",
  completed: "Gennemført",
  postponed: "Udsat",
  cancelled: "Annulleret",
};

const taskStatusLabels: Record<string, string> = {
  not_started: "Ikke påbegyndt",
  in_progress: "I gang",
  waiting: "Afventer",
  completed: "Gennemført",
  cancelled: "Annulleret",
};

function memberName(
  members: OrganizationMemberDirectoryEntry[],
  userId: string | null,
) {
  if (!userId) return "Ikke angivet";
  const member = members.find((item) => item.user_id === userId);
  return member?.full_name || member?.email || "Ikke angivet";
}

function periodLabel(event: AnnualWheelEventView) {
  const start = formatPdfDate(event.starts_on);
  return event.ends_on === event.starts_on
    ? start
    : `${start} - ${formatPdfDate(event.ends_on)}`;
}

function deadlineLabel(template: AnnualWheelEventView["taskTemplates"][number]) {
  if (template.deadline_offset_days === null) return "Ikke angivet";
  if (template.deadline_offset_days === 0) {
    return template.deadline_anchor === "start"
      ? "På startdato"
      : "På slutdato";
  }
  const direction = template.deadline_offset_days < 0 ? "før" : "efter";
  const anchor =
    template.deadline_anchor === "start" ? "startdato" : "slutdato";
  return `${Math.abs(template.deadline_offset_days)} dage ${direction} ${anchor}`;
}

export async function generateAnnualWheelEventPdf(
  input: AnnualWheelPdfInput,
) {
  const report = await createPdfReport({
    documentType: "Årshjulsaktivitet",
    title: input.event.title,
    organizationName: input.organizationName,
    committeeName: input.event.committee?.name ?? undefined,
    generatedAt: input.exportedAt,
    branding: input.branding,
    meta: [
      { label: "Organisation", value: input.organizationName },
      {
        label: "Udvalg",
        value: input.event.committee?.name ?? "Hele organisationen",
      },
      { label: "Periode", value: periodLabel(input.event) },
      { label: "Status", value: eventStatusLabels[input.event.status] },
      {
        label: "Kategori",
        value: input.event.category ?? "Ikke angivet",
      },
      {
        label: "Prioritet",
        value: annualWheelPriorityLabels[input.event.priority],
      },
      {
        label: "Ansvarlig",
        value:
          input.event.responsible?.full_name ||
          memberName(input.members, input.event.responsible_user_id),
      },
      { label: "Eksportdato", value: formatPdfDate(input.exportedAt) },
    ],
  });

  report.addBadge(
    eventStatusLabels[input.event.status],
    input.event.status === "completed"
      ? "success"
      : input.event.status === "cancelled"
        ? "neutral"
        : "neutral",
  );

  report.addSection("Aktivitet");
  report.addKeyValue(
    "Gentagelse",
    annualWheelRecurrenceLabels[input.event.recurrence],
  );
  if (richTextToPlainText(input.event.description)) {
    report.addSubsection("Beskrivelse");
    report.addProse(richTextToPdfBlocks(input.event.description));
  }

  if (input.event.keyPeople.length) {
    report.addSection("Ansvarlige og nøglepersoner");
    report.addTable(
      [
        {
          label: "Navn",
          width: 140,
          getValue: (person: AnnualWheelEventView["keyPeople"][number]) =>
            person.name,
        },
        {
          label: "Funktion",
          width: 125,
          getValue: (person: AnnualWheelEventView["keyPeople"][number]) =>
            person.role_title,
        },
        {
          label: "Telefon",
          width: 95,
          getValue: (person: AnnualWheelEventView["keyPeople"][number]) =>
            person.phone ?? "Ikke angivet",
        },
        {
          label: "E-mail",
          width: 140,
          getValue: (person: AnnualWheelEventView["keyPeople"][number]) =>
            person.email ?? "Ikke angivet",
        },
      ],
      input.event.keyPeople,
      "Ingen nøglepersoner.",
    );
  }

  if (input.event.taskTemplates.length) {
    report.addSection("Faste opgaver");
    report.addTable(
      [
        {
          label: "Titel",
          width: 145,
          getValue: (
            template: AnnualWheelEventView["taskTemplates"][number],
          ) => template.title,
        },
        {
          label: "Beskrivelse",
          width: 165,
          getValue: (
            template: AnnualWheelEventView["taskTemplates"][number],
          ) => richTextToPlainText(template.description),
        },
        {
          label: "Foreslået ansvarlig",
          width: 105,
          getValue: (
            template: AnnualWheelEventView["taskTemplates"][number],
          ) =>
            memberName(
              input.members,
              template.suggested_responsible_user_id,
            ),
        },
        {
          label: "Relativ deadline",
          width: 85,
          getValue: (
            template: AnnualWheelEventView["taskTemplates"][number],
          ) => deadlineLabel(template),
        },
      ],
      input.event.taskTemplates,
      "Ingen faste opgaver.",
    );
  }

  if (input.event.activatedTasks.length) {
    report.addSection("Aktiverede tasks");
    report.addTable(
      [
        {
          label: "Titel",
          width: 165,
          getValue: (task: AnnualWheelEventView["activatedTasks"][number]) =>
            task.title,
        },
        {
          label: "Status",
          width: 85,
          getValue: (task: AnnualWheelEventView["activatedTasks"][number]) =>
            taskStatusLabels[task.status] ?? "Aktiv",
        },
        {
          label: "Ansvarlig",
          width: 115,
          getValue: (task: AnnualWheelEventView["activatedTasks"][number]) =>
            memberName(input.members, task.responsible_user_id),
        },
        {
          label: "Deadline",
          width: 85,
          getValue: (task: AnnualWheelEventView["activatedTasks"][number]) =>
            task.deadline ? formatPdfDate(task.deadline) : "Ikke angivet",
        },
        {
          label: "År",
          width: 50,
          getValue: (task: AnnualWheelEventView["activatedTasks"][number]) =>
            task.annual_wheel_activation_year?.toString() ?? "-",
        },
      ],
      input.event.activatedTasks,
      "Ingen aktiverede tasks.",
    );
  }

  return report.save();
}
