import { generateMeetingAgendaPdf } from "../../src/lib/agenda-pdf";
import { generateAnnualWheelEventPdf } from "../../src/lib/annual-wheel-pdf";
import {
  generateAnnualWheelMatrixPdf,
  generateAnnualWheelVisualPdf,
} from "../../src/lib/annual-wheel-overview-pdf";
import { generateJobCardPdf } from "../../src/lib/job-card-pdf";
import { generateMeetingTasklistPdf } from "../../src/lib/meeting-tasklist-pdf";
import { generateMeetingMinutesPdf } from "../../src/lib/minutes-pdf";

export const fixtureDate = new Date("2026-08-03T10:15:00.000Z");
export const unicodeMarker = "ÆØÅ æøå é ñ Žluťoučký ✓ ⚠ ☕ 🚀";
export const longUrl = `https://eksempel.dk/${"meget-lang-url-del-".repeat(18)}slut`;
const longParagraph = `${unicodeMarker}. Dette er et langt syntetisk afsnit om økonomi, ansvar og opfølgning. ${"Ingen tekst må afkortes eller overlappe. ".repeat(35)} ${longUrl}`;
const richLongParagraph = `<p>${longParagraph}</p><ul><li>Første punkt med ansvar</li><li>Andet punkt med næste skridt</li></ul>`;

const members = [
  {
    user_id: "user-1",
    full_name: `Åse Østergaard ${unicodeMarker}`,
    email: "aase@example.test",
    status: "active",
    committees: [{ id: "committee-1", name: "Testudvalget" }],
  },
];

const agendaItems = Array.from({ length: 14 }, (_, index) => ({
  id: `agenda-${index + 1}`,
  item_type: index % 2 ? "discussion" : "decision",
  title: `Dagsordenspunkt ${index + 1}: ${unicodeMarker}`,
  objective: `<p>Formål ${index + 1}: ${longParagraph}</p>`,
  description: richLongParagraph,
}));

const meeting = {
  id: "meeting-1",
  organization_id: "organization-1",
  committee_id: "committee-1",
  title: `Langt dansk testmøde - ${unicodeMarker}`,
  description: richLongParagraph,
  location: `Mødelokale Øresund · ${longUrl}`,
  starts_at: "2026-08-03T10:15:00.000Z",
  status: "scheduled",
  agenda_item_occurrences: agendaItems.map((item, index) => ({
    id: `occurrence-${index + 1}`,
    position: index + 1,
    agenda_items: item,
  })),
};

const tasks = Array.from({ length: 28 }, (_, index) => ({
  id: `task-${index + 1}`,
  title: `Opgave ${index + 1}: ${unicodeMarker} ${longUrl}`,
  description: `<p>${longParagraph}</p>`,
  status: index % 5 === 0 ? "waiting" : "not_started",
  deadline: `2026-08-${String((index % 25) + 1).padStart(2, "0")}`,
  responsible_user_id: index % 3 ? "user-1" : null,
  responsible: index % 3 ? { full_name: members[0].full_name } : null,
  reviewSource: `Dagsordenspunkt ${(index % agendaItems.length) + 1}`,
  latestComment: { body: `<p>Seneste note: ${longParagraph}</p>` },
}));

const annualEvents = Array.from({ length: 32 }, (_, index) => ({
  id: `event-${index + 1}`,
  title: `Årshjulsaktivitet ${index + 1}: ${unicodeMarker} ${longUrl}`,
  description: richLongParagraph,
  starts_on: `2026-${String((index % 12) + 1).padStart(2, "0")}-01`,
  ends_on: `2026-${String((index % 12) + 1).padStart(2, "0")}-20`,
  status: index % 4 === 0 ? "completed" : "planned",
  priority: index % 3 === 0 ? "high" : "medium",
  recurrence: "annual",
  category: `Kategori ${index % 5}`,
  committee_id: "committee-1",
  committee: { id: "committee-1", name: `Testudvalg Øst ${unicodeMarker}` },
  responsible_user_id: "user-1",
  responsible: { full_name: members[0].full_name },
  keyPeople: Array.from({ length: 8 }, (_, personIndex) => ({
    name: `Nøgleperson ${personIndex + 1} ${unicodeMarker}`,
    role_title: `Funktion ${personIndex + 1}`,
    phone: "+45 12 34 56 78",
    email: `person-${personIndex + 1}@example.test`,
  })),
  taskTemplates: Array.from({ length: 12 }, (_, taskIndex) => ({
    title: `Fast opgave ${taskIndex + 1} ${unicodeMarker}`,
    description: richLongParagraph,
    suggested_responsible_user_id: "user-1",
    deadline_offset_days: taskIndex - 6,
    deadline_anchor: "start",
  })),
  activatedTasks: tasks.slice(0, 12).map((task, taskIndex) => ({
    ...task,
    annual_wheel_activation_year: 2026,
    annual_wheel_task_template_id: `template-${taskIndex + 1}`,
  })),
}));

const overview = {
  year: 2026,
  events: annualEvents,
  committees: [{ id: "committee-1", name: "Testudvalg Øst" }],
  members,
  editableCommitteeIds: ["committee-1"],
  canEditOrganization: true,
  calendarItems: Array.from({ length: 30 }, (_, index) => ({
    id: `calendar-${index + 1}`,
    kind: index % 3 === 0 ? "meeting" : index % 3 === 1 ? "task" : "decision",
    title: `Kalenderpunkt ${index + 1}: ${unicodeMarker} ${longUrl}`,
    date: `2026-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 25) + 1).padStart(2, "0")}`,
    committeeId: "committee-1",
    responsibleUserId: "user-1",
    priority: "medium",
    status: "not_started",
    href: "/syntetisk",
  })),
};

const role = {
  id: "role-1",
  title: `Kasserer og økonomiansvarlig ${unicodeMarker}`,
  purpose: richLongParagraph,
  responsibilities: richLongParagraph,
  meeting_expectations: richLongParagraph,
  description: richLongParagraph,
  competencies: richLongParagraph,
  exclusions: richLongParagraph,
  collaboration: richLongParagraph,
  contact_people: richLongParagraph,
  committees: overview.committees,
  assignments: [{ name: members[0].full_name, email: members[0].email }],
  responsibilityAreas: [{ name: `Økonomi ${unicodeMarker}` }],
  onboardingGuide: {
    first_30_days: richLongParagraph,
    introduction: richLongParagraph,
    practical_information: richLongParagraph,
  },
  taskTemplates: annualEvents[0].taskTemplates.map((template, index) => ({
    ...template,
    committee_id: "committee-1",
    category: `Kategori ${index + 1}`,
  })),
  annualWheelEvents: annualEvents.slice(0, 12),
  decisions: Array.from({ length: 12 }, (_, index) => ({
    decision_date: "2026-08-03",
    title: `Beslutning ${index + 1} ${unicodeMarker}`,
    description: richLongParagraph,
  })),
  documents: Array.from({ length: 8 }, (_, index) => ({
    title: `Dokument ${index + 1} ${unicodeMarker}`,
    url: longUrl,
  })),
};

export async function generateIssue12Fixtures() {
  const branding = {
    organizationName: `UX Testorganisation ${unicodeMarker}`,
    primaryColor: "#174f45",
    secondaryColor: "#d6b45f",
    accentColor: "#8b3d63",
    fontFamily: "Source Sans 3",
  };
  const transferredHistories = [
    {
      targetAgendaItemId: agendaItems[0].id,
      transferReason: "decision_requires_follow_up" as const,
      sourceMeetingTitle: `Tidligere møde ${unicodeMarker}`,
      sourceMeetingDate: "2026-06-15T17:00:00.000Z",
      sourceAgendaItemTitle: `Tidligere punkt om økonomi ${unicodeMarker}`,
      previousNotes: `<p>Tidligere noter: ${longParagraph}</p>`,
      previousDecision: `<p>Tidligere beslutning: ${longParagraph}</p>`,
      previousFollowUp: `<p>Tidligere opfølgning: ${longParagraph}</p>`,
      previousDecisions: [
        {
          title: `Tidligere relateret beslutning ${unicodeMarker}`,
          description: richLongParagraph,
          deadline: "2026-08-01",
        },
      ],
      previousTasks: [
        {
          title: `Tidligere relateret opgave ${unicodeMarker}`,
          description: richLongParagraph,
          deadline: "2026-08-01",
        },
      ],
    },
  ];
  const minutes = {
    id: "minutes-1",
    status: "approved",
    minutes_text: richLongParagraph,
    decisions: richLongParagraph,
  };
  const agendaItemMinutes = agendaItems.map((item, index) => ({
    agenda_item_id: item.id,
    status: "completed",
    notes: richLongParagraph,
    decision: `Beslutning i punkt ${index + 1}: ${longParagraph}`,
    follow_up: `Opfølgning i punkt ${index + 1}: ${longParagraph}`,
    responsible_user_id: "user-1",
    deadline: "2026-09-01",
  }));
  const pdfs: Record<string, Uint8Array> = {};
  pdfs["agenda"] = await generateMeetingAgendaPdf({
    meeting: meeting as never,
    committeeName: "UX Testudvalg",
    organizationName: branding.organizationName,
    branding,
    transferredHistories,
    generatedAt: fixtureDate,
  });
  pdfs["minutes"] = await generateMeetingMinutesPdf({
    meeting: meeting as never,
    committeeName: "UX Testudvalg",
    meetingMinutes: minutes as never,
    agendaItemMinutes: agendaItemMinutes as never,
    decisions: [
      {
        id: "decision-1",
        agenda_item_id: agendaItems[0].id,
        title: `Beslutning med symboler ${unicodeMarker}`,
        description: richLongParagraph,
        status: "active",
        category: "Økonomi",
        responsible_user_id: "user-1",
        responsible: { full_name: members[0].full_name },
        deadline: "2026-09-01",
      } as never,
    ],
    tasks: [
      {
        ...tasks[0],
        agenda_item_id: agendaItems[0].id,
      } as never,
    ],
    approvals: [
      {
        status: "approved",
        responded_at: "2026-08-03T12:00:00.000Z",
        memberName: members[0].full_name,
        comment: `Godkendt ${unicodeMarker}`,
      } as never,
    ],
    attachments: [
      {
        fileName: `Bilag ${unicodeMarker} ${longUrl}.pdf`,
        mimeType: "application/pdf",
        uploadedByName: members[0].full_name,
      } as never,
    ],
    responsiblePeople: [
      { id: "user-1", name: members[0].full_name, email: members[0].email },
    ],
    attendeeIds: ["user-1"],
    externalAttendees: [
      {
        name: `Zoë Åkesson ${unicodeMarker}`,
        role_note: "Observatør",
        email: "zoe@example.test",
        mobile: "+45 10 20 30 40",
      } as never,
    ],
    branding,
    transferredHistories,
    generatedAt: fixtureDate,
  });
  pdfs["tasks"] = await generateMeetingTasklistPdf({
    meeting: meeting as never,
    committeeName: "UX Testudvalg",
    organizationName: branding.organizationName,
    tasks: tasks as never,
    branding,
    generatedAt: fixtureDate,
  });
  pdfs["annual-event"] = await generateAnnualWheelEventPdf({
    organizationName: branding.organizationName,
    event: annualEvents[0] as never,
    members: members as never,
    exportedAt: fixtureDate,
    branding,
  });
  pdfs["annual-matrix"] = await generateAnnualWheelMatrixPdf({
    organizationName: branding.organizationName,
    overview: overview as never,
    exportedAt: fixtureDate,
    branding,
  });
  pdfs["annual-visual"] = await generateAnnualWheelVisualPdf({
    organizationName: branding.organizationName,
    overview: overview as never,
    exportedAt: fixtureDate,
    branding,
  });
  pdfs["job-card"] = await generateJobCardPdf({
    organizationName: branding.organizationName,
    role: role as never,
    exportedAt: fixtureDate,
    branding,
  });
  return pdfs;
}
