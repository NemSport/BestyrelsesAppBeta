import type { EmailTemplateBranding } from "@/lib/email-branding";
import {
  formatDateTime,
  getAgendaItemTypeLabel,
} from "@/lib/localization";
import { richTextToPlainText } from "@/lib/rich-text";
import { taskStatusLabels } from "@/lib/tasks";
import { formatDanishDate } from "@/lib/date-format";
import type { AgendaItem, Meeting } from "@/types/domain";

type TemplateResult = {
  subject: string;
  text: string;
  html: string;
};

type BrandingInput = {
  branding?: EmailTemplateBranding;
};

export type MinutesApprovalEmailTask = {
  id: string;
  title: string;
  deadline: string | null;
  status: keyof typeof taskStatusLabels;
  relation: string | null;
  url: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell({
  title,
  intro,
  content,
  organizationName,
  committeeName,
  branding,
}: {
  title: string;
  intro: string;
  content: string;
  organizationName: string;
  committeeName: string;
} & BrandingInput) {
  const primaryColor = branding?.primaryColor ?? "#12313e";
  const accentColor = branding?.accentColor ?? "#476f65";
  const logo = branding?.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(
        organizationName,
      )}" width="72" style="display:block;max-width:72px;max-height:44px;height:auto;margin:0 0 12px" />`
    : "";

  return [
    `<div style="font-family:Inter,Arial,sans-serif;color:#172033;line-height:1.55;max-width:720px">`,
    `<div style="border-top:4px solid ${escapeHtml(primaryColor)};padding-top:18px;margin-bottom:20px">`,
    logo,
    `<p style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:${escapeHtml(accentColor)};margin:0 0 8px">${escapeHtml(organizationName)} Â· ${escapeHtml(committeeName)}</p>`,
    `<h1 style="font-size:24px;line-height:1.2;margin:0 0 12px;color:${escapeHtml(primaryColor)}">${escapeHtml(title)}</h1>`,
    `<p style="font-size:15px;color:#293449;margin:0">${escapeHtml(intro)}</p>`,
    `</div>`,
    content,
    `<hr style="border:none;border-top:1px solid #ded8ce;margin:24px 0" />`,
    `<p style="font-size:12px;color:#657282">Sendt fra BestyrelsesApp. Dette er en manuel udsendelse fra appen.</p>`,
    `</div>`,
  ].join("");
}

export function meetingAgendaEmailTemplate({
  organizationName,
  committeeName,
  meeting,
  agendaItems,
  subject,
  message,
  meetingUrl,
  branding,
}: {
  organizationName: string;
  committeeName: string;
  meeting: Meeting;
  agendaItems: Array<
    Pick<AgendaItem, "title" | "item_type" | "objective" | "description">
  >;
  subject: string;
  message: string;
  meetingUrl: string;
} & BrandingInput): TemplateResult {
  const linkColor = branding?.primaryColor ?? "#0f4c81";
  const agendaText = agendaItems.length
    ? agendaItems
        .map((item, index) => {
          const typeLabel = getAgendaItemTypeLabel(item.item_type).label;
          const objective = richTextToPlainText(item.objective);
          const description = richTextToPlainText(item.description);
          return [
            `${index + 1}. ${item.title} (${typeLabel})`,
            objective ? `   Formål: ${objective}` : "",
            description ? `   Baggrund: ${description}` : "",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n")
    : "Der er endnu ikke dagsordenspunkter på mødet.";
  const htmlItems = agendaItems.length
    ? `<ol>${agendaItems
        .map((item) => {
          const typeLabel = getAgendaItemTypeLabel(item.item_type).label;
          const objective = richTextToPlainText(item.objective);
          const description = richTextToPlainText(item.description);
          const details = [
            objective
              ? `<p style="margin:8px 0 0"><strong>Formål:</strong> ${escapeHtml(objective)}</p>`
              : "",
            description
              ? `<p style="margin:6px 0 0"><strong>Baggrund:</strong> ${escapeHtml(description)}</p>`
              : "",
          ]
            .filter(Boolean)
            .join("");
          return `<li style="margin-bottom:14px"><strong>${escapeHtml(item.title)}</strong><br /><span style="color:#657282">${escapeHtml(typeLabel)}</span>${details}</li>`;
        })
        .join("")}</ol>`
    : `<p style="color:#657282">Der er endnu ikke dagsordenspunkter på mødet.</p>`;
  const intro =
    message ||
    `Her er dagsordenen for ${meeting.title} den ${formatDateTime(meeting.starts_at, "full")}.`;

  return {
    subject,
    text: [
      `${organizationName} Â· ${committeeName}`,
      "",
      subject,
      "",
      intro,
      "",
      `MÃ¸de: ${meeting.title}`,
      `Dato: ${formatDateTime(meeting.starts_at, "full")}`,
      "",
      "Dagsorden:",
      agendaText,
      "",
      `Ã…bn mÃ¸de: ${meetingUrl}`,
      "",
      "Sendt fra BestyrelsesApp.",
    ].join("\n"),
    html: shell({
      title: subject,
      intro,
      organizationName,
      committeeName,
      branding,
      content: [
        `<p><strong>MÃ¸de:</strong> ${escapeHtml(meeting.title)}<br />`,
        `<strong>Dato:</strong> ${escapeHtml(formatDateTime(meeting.starts_at, "full"))}</p>`,
        `<h2 style="font-size:17px;margin-top:22px">Dagsorden</h2>`,
        htmlItems,
        `<p style="margin-top:20px"><a href="${escapeHtml(meetingUrl)}" style="color:${escapeHtml(linkColor)};font-weight:700">Ã…bn mÃ¸de i BestyrelsesApp</a></p>`,
      ].join(""),
    }),
  };
}

export function approvedMinutesEmailTemplate({
  organizationName,
  committeeName,
  title,
  url,
  branding,
}: {
  organizationName: string;
  committeeName: string;
  title: string;
  url: string;
} & BrandingInput): TemplateResult {
  const linkColor = branding?.primaryColor ?? "#0f4c81";
  return {
    subject: `Godkendt referat: ${title}`,
    text: `${organizationName} Â· ${committeeName}\n\nReferatet er godkendt.\n\nÃ…bn referat: ${url}\n\nSendt fra BestyrelsesApp.`,
    html: shell({
      title: `Godkendt referat: ${title}`,
      intro: "Referatet er godkendt og kan lÃ¦ses i BestyrelsesApp.",
      organizationName,
      committeeName,
      branding,
      content: `<p><a href="${escapeHtml(url)}" style="color:${escapeHtml(linkColor)};font-weight:700">Ã…bn referat</a></p>`,
    }),
  };
}

function taskText(task: MinutesApprovalEmailTask) {
  return [
    `- ${task.title}`,
    task.deadline ? `  Deadline: ${formatDanishDate(task.deadline)}` : "",
    `  Status: ${taskStatusLabels[task.status] ?? task.status}`,
    task.relation ? `  Relation: ${task.relation}` : "",
    `  Link: ${task.url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function taskHtml(task: MinutesApprovalEmailTask, linkColor: string) {
  return [
    `<li style="margin-bottom:12px">`,
    `<a href="${escapeHtml(task.url)}" style="color:${escapeHtml(linkColor)};font-weight:700">${escapeHtml(task.title)}</a>`,
    `<div style="font-size:13px;color:#657282;margin-top:3px">`,
    task.deadline
      ? `Deadline: ${escapeHtml(formatDanishDate(task.deadline))} · `
      : "",
    `Status: ${escapeHtml(taskStatusLabels[task.status] ?? task.status)}`,
    task.relation ? ` · ${escapeHtml(task.relation)}` : "",
    `</div>`,
    `</li>`,
  ].join("");
}

export function meetingMinutesApprovalEmailTemplate({
  organizationName,
  committeeName,
  meetingTitle,
  meetingDate,
  approvalUrl,
  recipientName,
  personalTasks,
  unassignedTasks,
  branding,
}: {
  organizationName: string;
  committeeName: string;
  meetingTitle: string;
  meetingDate: string;
  approvalUrl: string;
  recipientName: string;
  personalTasks: MinutesApprovalEmailTask[];
  unassignedTasks: MinutesApprovalEmailTask[];
} & BrandingInput): TemplateResult {
  const linkColor = branding?.primaryColor ?? "#0f4c81";
  const personalText = personalTasks.length
    ? personalTasks.map(taskText).join("\n\n")
    : "Du har ingen opgaver tildelt fra dette møde.";
  const unassignedText = unassignedTasks.length
    ? unassignedTasks.map(taskText).join("\n\n")
    : "Der er ingen opgaver uden ansvarlig.";
  const personalHtml = personalTasks.length
    ? `<ul style="padding-left:20px;margin:8px 0 0">${personalTasks
        .map((task) => taskHtml(task, linkColor))
        .join("")}</ul>`
    : `<p style="color:#657282;margin:8px 0 0">Du har ingen opgaver tildelt fra dette møde.</p>`;
  const unassignedHtml = unassignedTasks.length
    ? `<ul style="padding-left:20px;margin:8px 0 0">${unassignedTasks
        .map((task) => taskHtml(task, linkColor))
        .join("")}</ul>`
    : `<p style="color:#657282;margin:8px 0 0">Der er ingen opgaver uden ansvarlig.</p>`;

  return {
    subject: `Referat klar til godkendelse: ${meetingTitle}`,
    text: [
      `${organizationName} · ${committeeName}`,
      "",
      `Hej ${recipientName}`,
      "",
      `Referatet for ${meetingTitle} (${meetingDate}) er klar til godkendelse.`,
      "PDF-referatet er vedhæftet denne mail.",
      "",
      `Åbn referat og godkend: ${approvalUrl}`,
      "",
      "Dine opgaver",
      personalText,
      "",
      "Opgaver uden ansvarlig",
      unassignedText,
      "",
      "Sendt fra BestyrelsesApp.",
    ].join("\n"),
    html: shell({
      title: `Referat klar til godkendelse`,
      intro: `Referatet for ${meetingTitle} er klar til godkendelse. PDF-referatet er vedhæftet.`,
      organizationName,
      committeeName,
      branding,
      content: [
        `<p><strong>Møde:</strong> ${escapeHtml(meetingTitle)}<br />`,
        `<strong>Dato:</strong> ${escapeHtml(meetingDate)}</p>`,
        `<p><a href="${escapeHtml(approvalUrl)}" style="color:${escapeHtml(linkColor)};font-weight:700">Åbn referat og godkend</a></p>`,
        `<h2 style="font-size:17px;margin-top:22px">Dine opgaver</h2>`,
        personalHtml,
        `<h2 style="font-size:17px;margin-top:22px">Opgaver uden ansvarlig</h2>`,
        unassignedHtml,
      ].join(""),
    }),
  };
}

export function taskReminderEmailTemplate({
  organizationName,
  committeeName,
  title,
  deadline,
  url,
  branding,
}: {
  organizationName: string;
  committeeName: string;
  title: string;
  deadline: string | null;
  url: string;
} & BrandingInput): TemplateResult {
  const linkColor = branding?.primaryColor ?? "#0f4c81";
  return {
    subject: `PÃ¥mindelse: ${title}`,
    text: `${organizationName} Â· ${committeeName}\n\nOpgave: ${title}\nDeadline: ${deadline || "Ingen deadline"}\n\nÃ…bn opgave: ${url}\n\nSendt fra BestyrelsesApp.`,
    html: shell({
      title: `PÃ¥mindelse: ${title}`,
      intro: "Der er en opgave, som krÃ¦ver opmÃ¦rksomhed.",
      organizationName,
      committeeName,
      branding,
      content: `<p><strong>Deadline:</strong> ${escapeHtml(deadline || "Ingen deadline")}</p><p><a href="${escapeHtml(url)}" style="color:${escapeHtml(linkColor)};font-weight:700">Ã…bn opgave</a></p>`,
    }),
  };
}

export function decisionsOverviewEmailTemplate({
  organizationName,
  committeeName,
  title,
  url,
  branding,
}: {
  organizationName: string;
  committeeName: string;
  title: string;
  url: string;
} & BrandingInput): TemplateResult {
  const linkColor = branding?.primaryColor ?? "#0f4c81";
  return {
    subject: `Beslutningsoversigt: ${title}`,
    text: `${organizationName} Â· ${committeeName}\n\nBeslutningsoversigten kan lÃ¦ses i BestyrelsesApp.\n\nÃ…bn oversigt: ${url}\n\nSendt fra BestyrelsesApp.`,
    html: shell({
      title: `Beslutningsoversigt: ${title}`,
      intro: "Beslutningsoversigten kan lÃ¦ses i BestyrelsesApp.",
      organizationName,
      committeeName,
      branding,
      content: `<p><a href="${escapeHtml(url)}" style="color:${escapeHtml(linkColor)};font-weight:700">Ã…bn beslutninger</a></p>`,
    }),
  };
}
