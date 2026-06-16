import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import {
  agendaItemMinutesStatusLabels,
  agendaItemTypeLabels,
  meetingMinuteApprovalStatusLabels,
} from "@/lib/localization";
import { richTextToPlainText } from "@/lib/rich-text";
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
};

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  const safeText = text.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
  for (const paragraph of safeText.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function generateMeetingMinutesPdf(input: PdfInput) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 50;
  const contentWidth = pageSize[0] - margin * 2;
  let page: PDFPage;
  let y = pageSize[1] - margin;

  const newPage = () => {
    page = document.addPage(pageSize);
    y = pageSize[1] - margin;
  };
  const ensureSpace = (height: number) => {
    if (y - height < margin) newPage();
  };
  const write = (
    text: string,
    options: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      gapAfter?: number;
    } = {},
  ) => {
    const font = options.font ?? regular;
    const size = options.size ?? 10;
    const lineHeight = size * 1.35;
    const lines = wrapText(text || "Ikke angivet", font, size, contentWidth);
    ensureSpace(lines.length * lineHeight + (options.gapAfter ?? 0));
    for (const line of lines) {
      page.drawText(line, {
        x: margin,
        y,
        font,
        size,
        color: options.color ?? rgb(0.09, 0.13, 0.11),
      });
      y -= lineHeight;
    }
    y -= options.gapAfter ?? 0;
  };
  const heading = (text: string) => {
    ensureSpace(30);
    y -= 8;
    write(text, { font: bold, size: 14, gapAfter: 6 });
  };
  const subheading = (text: string) => {
    ensureSpace(24);
    write(text, { font: bold, size: 11, gapAfter: 3 });
  };

  newPage();
  write("Godkendt mødereferat", {
    font: bold,
    size: 20,
    color: rgb(0.08, 0.3, 0.2),
    gapAfter: 8,
  });
  write(input.meeting.title, { font: bold, size: 16, gapAfter: 8 });
  write(
    `Udvalg: ${input.committeeName}\nMødedato: ${new Intl.DateTimeFormat(
      "da-DK",
      { dateStyle: "long", timeStyle: "short" },
    ).format(new Date(input.meeting.starts_at))}`,
    { gapAfter: 8 },
  );

  const attendeeNames = input.attendeeIds
    .map((id) => input.responsiblePeople.find((person) => person.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (attendeeNames.length > 0) {
    subheading("Deltagere");
    write(attendeeNames.join(", "), { gapAfter: 6 });
  }

  heading("Generelt referat");
  write(richTextToPlainText(input.meetingMinutes.minutes_text), {
    gapAfter: 6,
  });
  subheading("Beslutninger");
  write(richTextToPlainText(input.meetingMinutes.decisions), { gapAfter: 8 });

  heading("Dagsorden og punktreferater");
  const minutesByAgendaItem = new Map(
    input.agendaItemMinutes.map((minutes) => [minutes.agenda_item_id, minutes]),
  );
  for (const occurrence of input.meeting.agenda_item_occurrences) {
    const item = occurrence.agenda_items;
    if (!item) continue;
    const minutes = minutesByAgendaItem.get(item.id);
    subheading(
      `${occurrence.position + 1}. (${agendaItemTypeLabels[item.item_type].short}) ${item.title}`,
    );
    if (!minutes) {
      write("Der er ikke gemt et punktreferat.", { gapAfter: 6 });
      continue;
    }
    write(`Status: ${agendaItemMinutesStatusLabels[minutes.status]}`, {
      gapAfter: 3,
    });
    const notes = richTextToPlainText(minutes.notes);
    const decision = richTextToPlainText(minutes.decision);
    const followUp = richTextToPlainText(minutes.follow_up);
    if (notes) write(`Noter\n${notes}`, { gapAfter: 3 });
    if (decision) write(`Beslutning\n${decision}`, { gapAfter: 3 });
    if (followUp) write(`Opfølgning\n${followUp}`, { gapAfter: 3 });
    if (minutes.responsible_user_id) {
      const responsible = input.responsiblePeople.find(
        (person) => person.id === minutes.responsible_user_id,
      );
      write(`Ansvarlig: ${responsible?.name ?? "Ukendt medlem"}`);
    }
    if (minutes.deadline) write(`Deadline: ${minutes.deadline}`);
    y -= 6;
  }

  heading("Godkendelsesstatus");
  for (const approval of input.approvals) {
    write(
      `${approval.memberName}: ${
        meetingMinuteApprovalStatusLabels[approval.status]
      }${approval.comment ? `\nKommentar: ${approval.comment}` : ""}`,
      { gapAfter: 4 },
    );
  }

  heading("Vedhæftninger");
  if (input.attachments.length === 0) {
    write("Ingen vedhæftninger.");
  } else {
    for (const attachment of input.attachments) {
      write(
        `${attachment.fileName} (${attachment.mimeType}) - uploadet af ${attachment.uploadedByName}`,
        { gapAfter: 3 },
      );
    }
  }

  return document.save();
}
