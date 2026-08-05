import { formatDanishDate } from "@/lib/date-format";
import {
  createPdfReport,
  formatPdfDate,
  type PdfTableBadgeTone,
  type PdfReportBranding,
} from "@/lib/pdf-report";
import { richTextToPlainText } from "@/lib/rich-text";
import { getTaskDeadlineState, taskStatusLabels } from "@/lib/tasks";
import type { MeetingReviewTask } from "@/services/task-service";
import type { MeetingWithAgenda } from "@/types/domain";

type PdfInput = {
  meeting: MeetingWithAgenda;
  committeeName: string;
  organizationName: string;
  tasks: MeetingReviewTask[];
  branding?: PdfReportBranding;
  generatedAt?: Date;
};

type TaskRow = {
  checkbox: string;
  title: string;
  responsible: string;
  status: string;
  deadline: string;
  source: string;
  note: string;
  statusBadge: { label: string; tone: PdfTableBadgeTone };
  deadlineBadge: { label: string; tone: PdfTableBadgeTone } | null;
};

type PdfTaskStatus = MeetingReviewTask["status"] | "blocked";

function isOpenTask(task: MeetingReviewTask) {
  return task.status !== "completed" && task.status !== "cancelled";
}

function shortText(value: string | null | undefined) {
  return richTextToPlainText(value).replace(/\s+/g, " ").trim();
}

export function getTaskStatusPdfBadge(
  status: PdfTaskStatus,
): TaskRow["statusBadge"] {
  const badgeByStatus: Record<PdfTaskStatus, TaskRow["statusBadge"]> = {
    not_started: { label: taskStatusLabels.not_started, tone: "neutral" },
    in_progress: { label: taskStatusLabels.in_progress, tone: "progress" },
    waiting: { label: taskStatusLabels.waiting, tone: "warning" },
    blocked: { label: "Blokeret", tone: "orange" },
    completed: { label: "Færdig", tone: "success" },
    cancelled: { label: taskStatusLabels.cancelled, tone: "neutral" },
  };
  return badgeByStatus[status];
}

export function getTaskDeadlinePdfBadge(
  task: MeetingReviewTask,
  today: Date,
): TaskRow["deadlineBadge"] {
  const state = getTaskDeadlineState(task, today);
  if (state === "overdue") {
    return { label: "Overskredet", tone: "danger" };
  }
  if (state === "today" || state === "soon") {
    return { label: "Forfalder snart", tone: "warning" };
  }
  if (state === "none") {
    return { label: "Ingen deadline", tone: "neutral" };
  }
  return null;
}

function taskRow(task: MeetingReviewTask, generatedAt: Date): TaskRow {
  const latestComment = shortText(task.latestComment?.body);
  const description = shortText(task.description);
  const status = task.status as PdfTaskStatus;

  return {
    checkbox: "[ ]",
    title: task.title,
    responsible:
      task.responsible?.full_name ||
      (task.responsible_user_id ? "Ukendt medlem" : "Mangler"),
    status: "",
    statusBadge: getTaskStatusPdfBadge(status),
    deadline: task.deadline ? formatPdfDate(task.deadline) : "",
    deadlineBadge: getTaskDeadlinePdfBadge(task, generatedAt),
    source: task.reviewSource,
    note: latestComment || description || "",
  };
}

export async function generateMeetingTasklistPdf(input: PdfInput) {
  const generatedAt = input.generatedAt ?? new Date();
  const meetingDate = formatPdfDate(input.meeting.starts_at, true);
  const openTasks = input.tasks.filter(isOpenTask);
  const overdueCount = openTasks.filter(
    (task) => getTaskDeadlineState(task, generatedAt) === "overdue",
  ).length;
  const dueSoonCount = openTasks.filter((task) =>
    ["today", "soon"].includes(getTaskDeadlineState(task, generatedAt)),
  ).length;
  const waitingCount = openTasks.filter(
    (task) => task.status === "waiting",
  ).length;
  const missingResponsibleCount = openTasks.filter(
    (task) => !task.responsible_user_id,
  ).length;
  const missingDeadlineCount = openTasks.filter(
    (task) => !task.deadline,
  ).length;

  const report = await createPdfReport({
    documentType: "Opgaveliste",
    title: input.meeting.title,
    subtitle: meetingDate,
    organizationName: input.organizationName,
    committeeName: input.committeeName,
    generatedAt,
    orientation: "landscape",
    branding: input.branding,
    meta: [
      { label: "Organisation", value: input.organizationName },
      { label: "Udvalg", value: input.committeeName },
      { label: "Møde", value: input.meeting.title },
      { label: "Mødedato", value: meetingDate },
      {
        label: "Genereret",
        value: formatDanishDate(generatedAt, "long"),
      },
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
        width: 24,
        getValue: (row: TaskRow) => row.checkbox,
      },
      {
        label: "Opgave",
        width: 180,
        getValue: (row: TaskRow) => row.title,
      },
      {
        label: "Ansvarlig",
        width: 80,
        getValue: (row: TaskRow) => row.responsible,
      },
      {
        label: "Status",
        width: 88,
        getValue: (row: TaskRow) => row.status,
        getBadge: (row: TaskRow) => row.statusBadge,
      },
      {
        label: "Deadline",
        width: 90,
        getValue: (row: TaskRow) => row.deadline,
        getBadge: (row: TaskRow) => row.deadlineBadge,
      },
      {
        label: "Kilde",
        width: 82,
        getValue: (row: TaskRow) => row.source,
      },
      {
        label: "Seneste note",
        width: 204,
        getValue: (row: TaskRow) => row.note,
      },
    ],
    input.tasks.map((task) => taskRow(task, generatedAt)),
    "Ingen aktive opgaver til dette møde",
    { keepRowsTogether: true, minimumContinuationLines: 4 },
  );

  return report.save();
}
