import { formatDateTime } from "@/lib/localization";
import type { AgendaItem, Meeting } from "@/types/domain";

type TemplateResult = {
  subject: string;
  text: string;
  html: string;
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
}: {
  title: string;
  intro: string;
  content: string;
  organizationName: string;
  committeeName: string;
}) {
  return [
    `<div style="font-family:Inter,Arial,sans-serif;color:#172033;line-height:1.55;max-width:720px">`,
    `<p style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#657282">${escapeHtml(organizationName)} · ${escapeHtml(committeeName)}</p>`,
    `<h1 style="font-size:24px;line-height:1.2;margin:0 0 12px">${escapeHtml(title)}</h1>`,
    `<p style="font-size:15px;color:#293449">${escapeHtml(intro)}</p>`,
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
}: {
  organizationName: string;
  committeeName: string;
  meeting: Meeting;
  agendaItems: Array<Pick<AgendaItem, "title" | "item_type">>;
  subject: string;
  message: string;
  meetingUrl: string;
}): TemplateResult {
  const agendaText = agendaItems.length
    ? agendaItems
        .map((item, index) => `${index + 1}. ${item.title}`)
        .join("\n")
    : "Der er endnu ikke dagsordenspunkter på mødet.";
  const htmlItems = agendaItems.length
    ? `<ol>${agendaItems
        .map(
          (item) =>
            `<li><strong>${escapeHtml(item.title)}</strong><br /><span style="color:#657282">${escapeHtml(item.item_type)}</span></li>`,
        )
        .join("")}</ol>`
    : `<p style="color:#657282">Der er endnu ikke dagsordenspunkter på mødet.</p>`;

  const intro =
    message ||
    `Her er dagsordenen for ${meeting.title} den ${formatDateTime(meeting.starts_at, "full")}.`;

  return {
    subject,
    text: [
      `${organizationName} · ${committeeName}`,
      "",
      subject,
      "",
      intro,
      "",
      `Møde: ${meeting.title}`,
      `Dato: ${formatDateTime(meeting.starts_at, "full")}`,
      "",
      "Dagsorden:",
      agendaText,
      "",
      `Åbn møde: ${meetingUrl}`,
      "",
      "Sendt fra BestyrelsesApp.",
    ].join("\n"),
    html: shell({
      title: subject,
      intro,
      organizationName,
      committeeName,
      content: [
        `<p><strong>Møde:</strong> ${escapeHtml(meeting.title)}<br />`,
        `<strong>Dato:</strong> ${escapeHtml(formatDateTime(meeting.starts_at, "full"))}</p>`,
        `<h2 style="font-size:17px;margin-top:22px">Dagsorden</h2>`,
        htmlItems,
        `<p style="margin-top:20px"><a href="${escapeHtml(meetingUrl)}" style="color:#0f4c81;font-weight:700">Åbn møde i BestyrelsesApp</a></p>`,
      ].join(""),
    }),
  };
}

export function approvedMinutesEmailTemplate({
  organizationName,
  committeeName,
  title,
  url,
}: {
  organizationName: string;
  committeeName: string;
  title: string;
  url: string;
}): TemplateResult {
  return {
    subject: `Godkendt referat: ${title}`,
    text: `${organizationName} · ${committeeName}\n\nReferatet er godkendt.\n\nÅbn referat: ${url}\n\nSendt fra BestyrelsesApp.`,
    html: shell({
      title: `Godkendt referat: ${title}`,
      intro: "Referatet er godkendt og kan læses i BestyrelsesApp.",
      organizationName,
      committeeName,
      content: `<p><a href="${escapeHtml(url)}" style="color:#0f4c81;font-weight:700">Åbn referat</a></p>`,
    }),
  };
}

export function taskReminderEmailTemplate({
  organizationName,
  committeeName,
  title,
  deadline,
  url,
}: {
  organizationName: string;
  committeeName: string;
  title: string;
  deadline: string | null;
  url: string;
}): TemplateResult {
  return {
    subject: `Påmindelse: ${title}`,
    text: `${organizationName} · ${committeeName}\n\nOpgave: ${title}\nDeadline: ${deadline || "Ingen deadline"}\n\nÅbn opgave: ${url}\n\nSendt fra BestyrelsesApp.`,
    html: shell({
      title: `Påmindelse: ${title}`,
      intro: "Der er en opgave, som kræver opmærksomhed.",
      organizationName,
      committeeName,
      content: `<p><strong>Deadline:</strong> ${escapeHtml(deadline || "Ingen deadline")}</p><p><a href="${escapeHtml(url)}" style="color:#0f4c81;font-weight:700">Åbn opgave</a></p>`,
    }),
  };
}

export function decisionsOverviewEmailTemplate({
  organizationName,
  committeeName,
  title,
  url,
}: {
  organizationName: string;
  committeeName: string;
  title: string;
  url: string;
}): TemplateResult {
  return {
    subject: `Beslutningsoversigt: ${title}`,
    text: `${organizationName} · ${committeeName}\n\nBeslutningsoversigten kan læses i BestyrelsesApp.\n\nÅbn oversigt: ${url}\n\nSendt fra BestyrelsesApp.`,
    html: shell({
      title: `Beslutningsoversigt: ${title}`,
      intro: "Beslutningsoversigten kan læses i BestyrelsesApp.",
      organizationName,
      committeeName,
      content: `<p><a href="${escapeHtml(url)}" style="color:#0f4c81;font-weight:700">Åbn beslutninger</a></p>`,
    }),
  };
}
