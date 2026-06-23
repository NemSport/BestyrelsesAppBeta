import { z } from "zod";

import {
  agendaItemMinutesNeedsAction,
  agendaItemMinutesStatuses,
  agendaItemMinutesStatusOptions,
} from "@/lib/agenda-item-minutes";

export const uuidSchema = z.string().uuid("Ugyldigt id");

const requiredName = (label: string, max: number) =>
  z
    .string({
      required_error: `${label} skal udfyldes`,
      invalid_type_error: `${label} skal udfyldes`,
    })
    .trim()
    .min(1, `${label} skal udfyldes`)
    .min(2, `${label} skal være mindst 2 tegn`)
    .max(max, `${label} må højst være ${max} tegn`);

export const organizationInputSchema = z.object({
  name: requiredName("Organisationsnavn", 120),
});

export const committeeInputSchema = z.object({
  organizationId: uuidSchema,
  name: requiredName("Udvalgsnavn", 120),
  description: z
    .string()
    .trim()
    .max(2000, "Beskrivelsen må højst være 2.000 tegn")
    .default(""),
});

export const meetingInputSchema = z
  .object({
    organizationId: uuidSchema,
    committeeId: uuidSchema,
    title: requiredName("Titel", 160),
    description: z
      .string()
      .trim()
      .max(4000, "Beskrivelsen må højst være 4.000 tegn")
      .default(""),
    startsAt: z
      .string({
        required_error: "Startdato mangler",
        invalid_type_error: "Startdato mangler",
      })
      .min(1, "Startdato mangler")
      .datetime("Startdato er ugyldig"),
    endsAt: z.string().datetime("Slutdato er ugyldig").nullable().optional(),
    location: z
      .string()
      .trim()
      .max(240, "Sted må højst være 240 tegn")
      .nullable()
      .optional(),
  })
  .refine(
    ({ startsAt, endsAt }) => !endsAt || new Date(endsAt) > new Date(startsAt),
    { message: "Slutdato skal ligge efter startdato", path: ["endsAt"] },
  );

export const quickMeetingInputSchema = meetingInputSchema.and(
  z.object({
    minutesText: z
      .string()
      .trim()
      .max(100000, "Referattekst må højst være 100.000 tegn")
      .default(""),
  }),
);

export const emailRecipientSchema = z.object({
  memberUserIds: z.array(uuidSchema).max(200).default([]),
  includeCommittee: z.boolean().default(false),
});

export const sendMeetingAgendaEmailSchema = z
  .object({
    organizationId: uuidSchema,
    committeeId: uuidSchema,
    meetingId: uuidSchema,
    subject: z
      .string()
      .trim()
      .min(3, "Emne skal udfyldes")
      .max(180, "Emne må højst være 180 tegn"),
    message: z
      .string()
      .trim()
      .max(2000, "Beskeden må højst være 2.000 tegn")
      .default(""),
    recipients: emailRecipientSchema,
  })
  .superRefine((value, context) => {
    if (
      !value.recipients.includeCommittee &&
      value.recipients.memberUserIds.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vælg mindst én modtager eller hele udvalget.",
        path: ["recipients"],
      });
    }
  });

const agendaItemContentSchema = z.object({
  organizationId: uuidSchema,
  committeeId: uuidSchema,
  title: requiredName("Titel", 200),
  description: z
    .string()
    .trim()
    .max(10000, "Baggrunden må højst være 10.000 tegn")
    .default(""),
  objective: z
    .string()
    .trim()
    .max(4000, "Formålet må højst være 4.000 tegn")
    .default(""),
  itemType: z.enum(["information", "discussion", "decision", "follow_up"], {
    required_error: "Type skal vælges",
    invalid_type_error: "Type skal vælges",
  }),
  targetDate: z.string().date("Måldato er ugyldig").nullable().optional(),
});

const agendaItemCreateSchema = agendaItemContentSchema.extend({
  meetingId: uuidSchema.nullable().optional(),
});

export const agendaItemInputSchema = agendaItemCreateSchema.superRefine(
  ({ meetingId, targetDate }, context) => {
    if (!meetingId && !targetDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vælg enten et møde eller en dato.",
        path: ["meetingId"],
      });
    }
    if (meetingId && targetDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vælg kun enten møde eller dato.",
        path: ["meetingId"],
      });
    }
  },
);

export const organizationUpdateSchema = organizationInputSchema.extend({
  organizationId: uuidSchema,
});

export const organizationTrashActionSchema = z.object({
  organizationId: uuidSchema,
});

export const organizationInvitationInputSchema = z.object({
  organizationId: uuidSchema,
  email: z
    .string({
      required_error: "E-mail skal udfyldes",
      invalid_type_error: "E-mail skal udfyldes",
    })
    .trim()
    .min(1, "E-mail skal udfyldes")
    .email("Indtast en gyldig e-mailadresse")
    .transform((email) => email.toLowerCase()),
  role: z.enum(["owner", "admin", "member", "viewer"], {
    required_error: "Rolle skal vælges",
    invalid_type_error: "Rolle skal vælges",
  }),
});

export const organizationMemberRoleUpdateSchema = z.object({
  organizationId: uuidSchema,
  userId: uuidSchema,
  role: z.enum(["owner", "admin", "member", "viewer"], {
    required_error: "Rolle skal vælges",
    invalid_type_error: "Rolle skal vælges",
  }),
});

export const organizationMemberRemoveSchema = z.object({
  organizationId: uuidSchema,
  userId: uuidSchema,
});

export const manualOrganizationMemberInputSchema = z
  .object({
    organizationId: uuidSchema,
    fullName: z
      .string({
        required_error: "Navn skal udfyldes",
        invalid_type_error: "Navn skal udfyldes",
      })
      .trim()
      .min(1, "Navn skal udfyldes")
      .min(2, "Navn skal være mindst 2 tegn")
      .max(160, "Navn må højst være 160 tegn"),
    email: z
      .string({
        required_error: "E-mail skal udfyldes",
        invalid_type_error: "E-mail skal udfyldes",
      })
      .trim()
      .min(1, "E-mail skal udfyldes")
      .email("Indtast en gyldig e-mailadresse")
      .transform((email) => email.toLowerCase()),
    temporaryPassword: z
      .string({
        required_error: "Midlertidig adgangskode skal udfyldes",
        invalid_type_error: "Midlertidig adgangskode skal udfyldes",
      })
      .min(8, "Adgangskoden skal være mindst 8 tegn")
      .max(128, "Adgangskoden må højst være 128 tegn"),
    role: z.enum(["admin", "member", "viewer"], {
      required_error: "Organisationsrolle skal vælges",
      invalid_type_error: "Organisationsrolle skal vælges",
    }),
    committeeAssignments: z
      .array(
        z.object({
          committeeId: uuidSchema,
          role: z.enum(["chair", "secretary", "member", "viewer"], {
            required_error: "Udvalgsrolle skal vælges",
            invalid_type_error: "Udvalgsrolle er ugyldig",
          }),
        }),
        { invalid_type_error: "Udvalgstilknytninger er ugyldige" },
      )
      .default([]),
  })
  .superRefine(({ committeeAssignments }, context) => {
    const committeeIds = committeeAssignments.map(
      (assignment) => assignment.committeeId,
    );
    if (new Set(committeeIds).size !== committeeIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Det samme udvalg kan kun vælges én gang",
        path: ["committeeAssignments"],
      });
    }
  });

export const committeeUpdateSchema = committeeInputSchema.extend({
  committeeId: uuidSchema,
});

export const meetingUpdateSchema = meetingInputSchema.and(
  z.object({ meetingId: uuidSchema }),
);

export const agendaItemUpdateSchema = agendaItemContentSchema.extend({
  agendaItemId: uuidSchema,
});

export const agendaItemRemoveSchema = z.object({
  organizationId: uuidSchema,
  committeeId: uuidSchema,
  agendaItemId: uuidSchema,
});

export const scheduleAgendaItemSchema = z.object({
  organizationId: uuidSchema,
  committeeId: uuidSchema,
  agendaItemId: uuidSchema,
  meetingId: uuidSchema,
  durationMinutes: z
    .number()
    .int("Varigheden skal være et helt antal minutter")
    .positive("Varigheden skal være større end 0")
    .max(1440, "Varigheden må højst være 1.440 minutter")
    .nullable()
    .optional(),
});

export const scheduleTransferredAgendaItemSchema = z.object({
  transferId: uuidSchema,
  meetingId: uuidSchema.nullable().optional(),
});

const optionalMinutesText = (label: string, max: number) =>
  z
    .string({
      required_error: `${label} mangler`,
      invalid_type_error: `${label} er ugyldig`,
    })
    .trim()
    .max(max, `${label} må højst være ${max.toLocaleString("da-DK")} tegn`)
    .default("");

export const meetingMinutesInputSchema = z.object({
  organizationId: uuidSchema,
  committeeId: uuidSchema,
  meetingId: uuidSchema,
  minutesText: optionalMinutesText("Referattekst", 100000),
  decisions: optionalMinutesText("Beslutninger", 50000),
  internalNote: z
    .string()
    .trim()
    .max(20000, "Intern note må højst være 20.000 tegn")
    .nullable()
    .optional(),
  status: z.enum(["draft", "ready_for_approval", "approved"], {
    required_error: "Status skal vælges",
    invalid_type_error: "Status er ugyldig",
  }),
});

export const agendaItemMinutesInputSchema = z
  .object({
    organizationId: uuidSchema,
    committeeId: uuidSchema,
    meetingId: uuidSchema,
    agendaItemId: uuidSchema,
    agendaItemOccurrenceId: uuidSchema.nullable().optional(),
    itemType: z.enum(["information", "discussion", "decision", "follow_up"]),
    notes: optionalMinutesText("Noter", 50000),
    decision: optionalMinutesText("Beslutning", 50000),
    followUp: optionalMinutesText("Opfølgning", 50000),
    responsibleUserId: uuidSchema.nullable().optional(),
    deadline: z.string().date("Deadline er ugyldig").nullable().optional(),
    status: z.enum(agendaItemMinutesStatuses, {
      required_error: "Status skal vælges",
      invalid_type_error: "Status er ugyldig",
    }),
  })
  .superRefine((value, context) => {
    if (!agendaItemMinutesStatusOptions[value.itemType].includes(value.status)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Status passer ikke til dagsordenspunktets type.",
        path: ["status"],
      });
      return;
    }

    if (
      agendaItemMinutesNeedsAction(
        value.itemType,
        value.status,
        value.followUp,
      )
    ) {
      if (!value.responsibleUserId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ansvarlig mangler for opfølgningspunktet.",
          path: ["responsibleUserId"],
        });
      }
      if (!value.deadline) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Deadline mangler for opfølgningspunktet.",
          path: ["deadline"],
        });
      }
    }
  });

export const sendMinutesForApprovalSchema = z.object({
  organizationId: uuidSchema,
  committeeId: uuidSchema,
  meetingId: uuidSchema,
  deadline: z
    .string({
      required_error: "Godkendelsesfrist skal udfyldes",
      invalid_type_error: "Godkendelsesfrist er ugyldig",
    })
    .date("Godkendelsesfrist er ugyldig"),
});

export const minutesApprovalResponseSchema = z
  .object({
    organizationId: uuidSchema,
    committeeId: uuidSchema,
    meetingId: uuidSchema,
    status: z.enum(["approved", "change_requested"], {
      required_error: "Vælg et godkendelsessvar",
      invalid_type_error: "Godkendelsessvaret er ugyldigt",
    }),
    comment: z
      .string()
      .trim()
      .max(4000, "Kommentaren må højst være 4.000 tegn")
      .nullable()
      .optional(),
  })
  .superRefine(({ status, comment }, context) => {
    if (status === "change_requested" && !comment) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Begrundelse for ændringer skal udfyldes.",
        path: ["comment"],
      });
    }
  });

export const markNoResponseSchema = z.object({
  organizationId: uuidSchema,
  committeeId: uuidSchema,
  meetingId: uuidSchema,
});

const optionalDecisionText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} må højst være ${max.toLocaleString("da-DK")} tegn`)
    .nullable()
    .optional();

export const decisionInputSchema = z.object({
  organizationId: uuidSchema,
  committeeId: uuidSchema,
  meetingId: uuidSchema.nullable().optional(),
  agendaItemId: uuidSchema.nullable().optional(),
  title: requiredName("Titel", 240),
  description: z
    .string()
    .trim()
    .max(20000, "Beskrivelsen må højst være 20.000 tegn")
    .default(""),
  status: z.enum(
    ["not_started", "in_progress", "waiting", "completed", "cancelled"],
    {
      required_error: "Status skal vælges",
      invalid_type_error: "Status er ugyldig",
    },
  ),
  responsibleUserId: uuidSchema.nullable().optional(),
  decisionDate: z
    .string({ required_error: "Beslutningsdato skal udfyldes" })
    .date("Beslutningsdato er ugyldig"),
  deadline: z.string().date("Deadline er ugyldig").nullable().optional(),
  category: optionalDecisionText("Kategori", 120),
  internalNote: optionalDecisionText("Intern note", 10000),
});

export const decisionUpdateSchema = decisionInputSchema.extend({
  decisionId: uuidSchema,
});

export const decisionActionSchema = z.object({
  organizationId: uuidSchema,
  decisionId: uuidSchema,
  action: z.enum(["archive", "cancel"], {
    required_error: "Handling mangler",
    invalid_type_error: "Handlingen er ugyldig",
  }),
});

export const taskInputSchema = z.object({
  organizationId: uuidSchema,
  committeeId: uuidSchema,
  meetingId: uuidSchema.nullable().optional(),
  agendaItemId: uuidSchema.nullable().optional(),
  decisionId: uuidSchema.nullable().optional(),
  title: requiredName("Titel", 240),
  description: z
    .string()
    .trim()
    .max(20000, "Beskrivelsen må højst være 20.000 tegn")
    .default(""),
  status: z.enum(
    ["not_started", "in_progress", "waiting", "completed", "cancelled"],
    {
      required_error: "Status skal vælges",
      invalid_type_error: "Status er ugyldig",
    },
  ),
  responsibleUserId: uuidSchema.nullable().optional(),
  deadline: z.string().date("Deadline er ugyldig").nullable().optional(),
  reminderAt: z
    .string()
    .datetime("Påmindelsestidspunktet er ugyldigt")
    .nullable()
    .optional(),
  category: optionalDecisionText("Kategori", 120),
  internalNote: optionalDecisionText("Intern note", 10000),
});

export const taskUpdateSchema = taskInputSchema.extend({
  taskId: uuidSchema,
});

export const taskActionSchema = z.object({
  organizationId: uuidSchema,
  taskId: uuidSchema,
  action: z.enum(["archive", "complete"], {
    required_error: "Handling mangler",
    invalid_type_error: "Handlingen er ugyldig",
  }),
});

export const taskCommentInputSchema = z.object({
  organizationId: uuidSchema,
  taskId: uuidSchema,
  body: z
    .string({
      required_error: "Kommentaren skal udfyldes",
      invalid_type_error: "Kommentaren er ugyldig",
    })
    .trim()
    .min(1, "Kommentaren skal udfyldes")
    .max(5000, "Kommentaren må højst være 5.000 tegn"),
});

export const annualWheelEventInputSchema = z
  .object({
    organizationId: uuidSchema,
    committeeId: uuidSchema.nullable().optional(),
    meetingId: uuidSchema.nullable().optional(),
    taskId: uuidSchema.nullable().optional(),
    title: requiredName("Titel", 240),
    description: z
      .string()
      .trim()
      .max(20000, "Beskrivelsen må højst være 20.000 tegn")
      .default(""),
    startsOn: z
      .string({ required_error: "Startdato skal udfyldes" })
      .date("Startdato er ugyldig"),
    endsOn: z
      .string({ required_error: "Slutdato skal udfyldes" })
      .date("Slutdato er ugyldig"),
    responsibleUserId: uuidSchema.nullable().optional(),
    category: optionalDecisionText("Kategori", 120),
    priority: z.enum(["low", "medium", "high", "critical"]),
    recurrence: z.enum([
      "none",
      "monthly",
      "quarterly",
      "semiannual",
      "annual",
      "custom",
    ]),
    recurrenceInterval: z
      .number()
      .int("Intervallet skal være et helt tal")
      .min(1, "Intervallet skal være mindst 1")
      .max(120, "Intervallet må højst være 120 måneder"),
  })
  .superRefine((value, context) => {
    if (value.endsOn < value.startsOn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Slutdato må ikke ligge før startdato",
        path: ["endsOn"],
      });
    }
  });

export const annualWheelEventUpdateSchema =
  annualWheelEventInputSchema.and(z.object({ eventId: uuidSchema }));

export const annualWheelEventDeleteSchema = z.object({
  organizationId: uuidSchema,
  eventId: uuidSchema,
});

const jobCardText = (label: string, max = 20000) =>
  z.string().trim().max(max, `${label} må højst være ${max.toLocaleString("da-DK")} tegn`).default("");

function compactJobCardDocuments(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.filter((item) => {
    if (!item || typeof item !== "object") return true;
    const record = item as Record<string, unknown>;
    return Boolean(
      String(record.title ?? "").trim() || String(record.url ?? "").trim(),
    );
  });
}

function compactJobCardTaskTemplates(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.filter((item) => {
    if (!item || typeof item !== "object") return true;
    const record = item as Record<string, unknown>;
    return Boolean(
      String(record.title ?? "").trim() ||
        String(record.description ?? "").trim() ||
        String(record.category ?? "").trim() ||
        (record.defaultDeadlineDays !== null &&
          record.defaultDeadlineDays !== undefined),
    );
  });
}

export const jobCardInputSchema = z.object({
  organizationId: uuidSchema,
  title: requiredName("Titel", 180),
  purpose: jobCardText("Formål"),
  description: jobCardText("Beskrivelse"),
  responsibilities: jobCardText("Ansvarsområder"),
  exclusions: jobCardText("Afgrænsning"),
  competencies: jobCardText("Kompetencer"),
  collaboration: jobCardText("Samarbejdsrelationer"),
  meetingExpectations: jobCardText("Mødedeltagelse"),
  contactPeople: jobCardText("Kontaktpersoner"),
  responsibilityAreaIds: z.array(uuidSchema).max(30).default([]),
  committeeIds: z.array(uuidSchema).max(30).default([]),
  assignedUserIds: z.array(uuidSchema).max(30).default([]),
  documents: z.preprocess(
    compactJobCardDocuments,
    z
      .array(
        z.object({
          title: requiredName("Dokumenttitel", 180),
          url: z
            .string()
            .url("Linket er ugyldigt")
            .max(2048)
            .refine(
              (value) => value.startsWith("https://") || value.startsWith("http://"),
              "Linket skal begynde med http:// eller https://",
            ),
        }),
      )
      .max(30)
      .default([]),
  ),
  taskTemplates: z.preprocess(
    compactJobCardTaskTemplates,
    z
      .array(
        z.object({
          committeeId: uuidSchema,
          title: requiredName("Opgavetitel", 240),
          description: jobCardText("Opgavebeskrivelse"),
          category: optionalDecisionText("Kategori", 120),
          defaultDeadlineDays: z.number().int().min(0).max(3650).nullable(),
        }),
      )
      .max(50)
      .default([]),
  ),
  onboarding: z.object({
    introduction: jobCardText("Introduktion"),
    first30Days: jobCardText("De første 30 dage"),
    practicalInformation: jobCardText("Praktisk information"),
  }),
});

export const jobCardUpdateSchema = jobCardInputSchema.extend({
  roleProfileId: uuidSchema,
});

export const jobCardArchiveSchema = z.object({
  organizationId: uuidSchema,
  roleProfileId: uuidSchema,
});

export const responsibilityAreaInputSchema = z.object({
  organizationId: uuidSchema,
  name: requiredName("Navn", 120),
  description: jobCardText("Beskrivelse", 2000),
});

export const taskTemplateInstantiateSchema = z.object({
  organizationId: uuidSchema,
  taskTemplateId: uuidSchema,
});

export const committeeTrashActionSchema = z.object({
  organizationId: uuidSchema,
  committeeId: uuidSchema,
});

export const meetingTrashActionSchema = z.object({
  organizationId: uuidSchema,
  committeeId: uuidSchema,
  meetingId: uuidSchema,
});

export const agendaItemTrashActionSchema = z.object({
  organizationId: uuidSchema,
  committeeId: uuidSchema,
  agendaItemId: uuidSchema,
});

export const agendaItemOccurrenceTrashActionSchema = z.object({
  organizationId: uuidSchema,
  committeeId: uuidSchema,
  occurrenceId: uuidSchema,
});

export const organizationTrashRestoreSchema = z.object({
  organizationId: uuidSchema,
  type: z.enum(["organization", "committee", "meeting", "agenda_item"], {
    required_error: "Vælg et element, der skal gendannes",
    invalid_type_error: "Elementtypen er ugyldig",
  }),
  id: uuidSchema,
  committeeId: uuidSchema.nullable().optional(),
});
