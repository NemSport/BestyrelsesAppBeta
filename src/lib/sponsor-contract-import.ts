import { z } from "zod";
import { stakeholderContractInputSchema } from "@/lib/validation";

export const sponsorContractFields = {
  name: "Firmanavn",
  cvr: "CVR",
  address: "Adresse",
  postalCode: "Postnr.",
  city: "By",
  email: "E-mail",
  phone: "Telefon",
  contact: "Kontaktperson",
  title: "Kontrakttitel",
  startDate: "Startdato",
  endDate: "Slutdato",
  total: "Samlet beløb",
  annual: "Årligt beløb",
  currency: "Valuta",
  noticeDeadline: "Opsigelsesfrist",
  renewalDeadline: "Fornyelsesfrist",
} as const;

export type ContractField = keyof typeof sponsorContractFields;
const extracted = z.object({
  value: z.string().trim().max(240).nullable(),
  page: z.number().int().positive().nullable(),
});
const keys = Object.keys(sponsorContractFields) as ContractField[];
export const extractedSponsorContract = z.object({
  fields: z.object(
    Object.fromEntries(keys.map((key) => [key, extracted])) as Record<
      ContractField,
      typeof extracted
    >,
  ),
  autoRenew: z.boolean().nullable(),
  deliverables: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(180),
        page: z.number().int().positive().nullable(),
      }),
    )
    .max(20),
});

export const contractImportValues = z.object(
  Object.fromEntries(
    keys.map((key) => [key, z.string().trim().max(240)]),
  ) as Record<ContractField, z.ZodString>,
);

export const approveSponsorContract = z.object({
  analysisId: z.string().uuid(),
  sponsorId: z.string().uuid().nullable(),
  fields: contractImportValues,
  autoRenew: z.boolean(),
  deliverables: z.array(z.string().trim().min(2).max(180)).max(20),
});

export type ContractPreview = z.infer<typeof extractedSponsorContract> & {
  analysisId: string;
  sponsors: {
    id: string;
    name: string;
    cvr: string | null;
    type: string;
    conflicts: string[];
  }[];
  suggestedId: string | null;
  matchingIds: string[];
  reviewMatch: boolean;
};

export function validateContractApproval(
  organizationId: string,
  input: z.infer<typeof approveSponsorContract>,
) {
  const { fields } = input;
  const amount = (value: string) =>
    !value
      ? null
      : /^\d{1,12}(?:[.,]\d{1,2})?$/.test(value)
        ? Number(value.replace(",", "."))
        : Number.NaN;
  const contract = stakeholderContractInputSchema.parse({
    organizationId,
    stakeholderId: input.sponsorId ?? organizationId,
    title: fields.title,
    startDate: fields.startDate,
    endDate: fields.endDate || null,
    noticeDeadline: fields.noticeDeadline || null,
    renewalDeadline: fields.renewalDeadline || null,
    contractValue: amount(fields.total),
    annualValue: amount(fields.annual),
    currency: z
      .string()
      .regex(/^[a-z]{3}$/i, "Angiv en valutakode på tre bogstaver.")
      .parse(fields.currency),
    autoRenew: input.autoRenew,
  });
  const sponsor = z
    .object({
      name: z
        .string()
        .trim()
        .max(180)
        .refine(
          (name) => input.sponsorId || name.length >= 2,
          "Angiv sponsorens firmanavn.",
        ),
      cvr: z.string().regex(/^(?:\d{8})?$/, "CVR skal have otte cifre."),
      email: z
        .string()
        .max(254)
        .refine(
          (value) => !value || z.string().email().safeParse(value).success,
          "E-mail er ugyldig.",
        ),
      address: z.string().max(240),
      postalCode: z.string().max(24),
      city: z.string().max(120),
      phone: z.string().max(80),
      contact: z.string().max(160),
    })
    .parse(fields);
  if (
    input.deliverables.some(
      (title, index, values) =>
        values.findIndex(
          (other) => other.toLowerCase() === title.toLowerCase(),
        ) !== index,
    )
  ) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["deliverables"],
        message: "Den samme ydelse står flere gange.",
      },
    ]);
  }
  return { ...input, contract, sponsor };
}
