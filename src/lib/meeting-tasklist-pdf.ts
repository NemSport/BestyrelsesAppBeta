import { formatDanishDate } from "@/lib/date-format";
import {
  createPdfReport,
  formatPdfDate,
  type PdfReportBranding,
} from "@/lib/pdf-report";
import { richTextToPlainText } from "@/lib/rich-text";
import {
  getTaskDeadlineState,
  taskStatusLabels,
} from "@/lib/tasks";
import type { MeetingReviewTask } from "@/services/task-service";
import type { MeetingWithAgenda } from "@/types/domain";

type PdfInput = {
  meeting: MeetingWithAgenda;
  committeeName: string;
  organizationName: string;
  tasks: MeetingReviewTask[];
  branding?: PdfReportBranding;
};

type TaskRow = {
  checkbox: string;
  title: string;
  responsible: string;
  status: string;
  deadline: string;
  source: string;
  note: string;
};

function isOpenTask(task: MeetingReviewTask) {
  return task.status !== "completed" && task.status !== "cancelled";
}

function shortText(value: string | null | undefined) {
  return richTextToPlainText(value).replace(/\s+/g, " ").trim();
}

function taskRow(task: MeetingReviewTask): TaskRow {
  const latestComment = shortText(task.latestComment?.body);
  const description = shortText(task.description);

  return {
    checkbox: "[ ]",
    title: task.title,
    responsible:
      task.responsible?.full_name ||
      (task.responsible_user_id ? "Ukendt medlem" : "Mangler"),
    status: taskStatusLabels[task.status] ?? task.status,
    deadline: task.deadline ? formatPdfDate(task.deadline) : "Mangler",
    source: task.reviewSource,
    note: latestComment || description || "",
  };
}

export async function generateMeetingTasklistPdf(input: PdfInput) {
  const meetingDate = formatPdfDate(input.meeting.starts_at, true);
  const openTasks = input.tasks.filter(isOpenTask);
  const overdueCount = openTasks.filter(
    (task) => getTaskDeadlineState(task) === "overdue",
  ).length;
  const dueSoonCount = openTasks.filter((task) =>
    ["today", "soon"].includes(getTaskDeadlineState(task)),
  ).length;
  const waitingCount = openTasks.filter((task) => task.status === "waiting")
    .length;
  const missingResponsibleCount = openTasks.filter(
    (task) => !task.responsible_user_id,
  ).length;
  const missingDeadlineCount = openTasks.filter((task) => !task.deadline).length;

  const report = await createPdfReport({
    documentType: "Opgaveliste",
    title: input.meeting.title,
    subtitle: meetingDate,
    organizationName: input.organizationName,
    committeeName: input.committeeName,
    generatedAt: new Date(),
    branding: input.branding,
    meta: [
      { label: "Organisation", value: input.organizationName },
      { label: "Udvalg", value: input.committeeName },
      { label: "Møde", value: input.meeting.title },
      { label: "Mødedato", value: meetingDate },
      { label: "Genereret", value: formatDanishDate(new Date(), "long") },
    ],
  });

  report.addSection("Opsummering");
  report.addMetaGrid([
    { label: "Aktive opgaver", value: String(openTasks.length) },
    { label: "Overskredet", value: String(overdueCount) },
    { label: "Forfalder snart", value: String(dueSoonCount) },
    { label: "Afventer/blokeret", value: String(waitingCount) },
    { label: "Mangler ansvarlig", value: String(missingResponsibleCount) },
    { label: "Mangler deadline", value: String(missingDeadlineCount) },
  ]);

  report.addSection("Opgaver til gennemgang");

  if (!input.tasks.length) {
    report.addParagraph("Ingen aktive opgaver til dette møde");
    return report.save();
  }

  report.addTable(
    [
      {
        label: "",
        width: 25,
        getValue: (row: TaskRow) => row.checkbox,
      },
      {
        label: "Opgave",
        width: 125,
        getValue: (row: TaskRow) => row.title,
      },
      {
        label: "Ansvarlig",
        width: 70,
        getValue: (row: TaskRow) => row.responsible,
      },
      {
        label: "Status",
        width: 62,
        getValue: (row: TaskRow) => row.status,
      },
      {
        label: "Deadline",
        width: 60,
        getValue: (row: TaskRow) => row.deadline,
      },
      {
        label: "Kilde",
        width: 78,
        getValue: (row: TaskRow) => row.source,
      },
      {
        label: "Seneste note",
        width: 83,
        getValue: (row: TaskRow) => row.note,
      },
    ],
    input.tasks.map(taskRow),
    "Ingen aktive opgaver til dette møde",
  );

  return report.save();
}
