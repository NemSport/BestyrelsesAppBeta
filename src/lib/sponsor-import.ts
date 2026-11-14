import { z } from "zod";

export const sponsorFields = {
  name: "Firmanavn",
  cvr_number: "CVR",
  address_line: "Adresse",
  postal_code: "Postnr.",
  city: "By",
  phone: "Telefon",
  email: "E-mail",
  notes: "Noter",
} as const;
export type SponsorField = keyof typeof sponsorFields;

const optionalText = (length: number) =>
  z.string().trim().min(1).max(length).optional();
export const sponsorRow = z.object({
  source: z.string().max(150),
  row: z.number().int().positive(),
  fields: z.object({
    name: z.string().trim().min(2).max(180),
    cvr_number: optionalText(32),
    address_line: optionalText(240),
    postal_code: optionalText(24),
    city: optionalText(120),
    phone: optionalText(80),
    email: z.string().trim().email().max(254).optional(),
    notes: optionalText(10000),
  }),
  contact: optionalText(160),
  owner: optionalText(160),
  details: z.array(z.tuple([z.string().max(150), z.string().max(500)])).max(30),
  warnings: z.array(z.string().max(150)).max(12),
});
export type SponsorRow = z.infer<typeof sponsorRow>;
export type SponsorRecord = {
  id: string;
  name: string;
  cvr_number: string | null;
  email: string | null;
  phone: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  notes: string | null;
  internal_owner_user_id: string | null;
  updated_at: string;
  archived_at: string | null;
  contacts?: string[];
};
export type SponsorCandidate = Pick<
  SponsorRecord,
  "id" | "name" | "cvr_number" | "city"
> & { archived: boolean };
export type SponsorProposal = {
  row: SponsorRow;
  additionalRows?: Pick<SponsorRow, "source" | "row">[];
  kind: "new" | "update" | "review" | "unchanged";
  candidates: (SponsorCandidate & {
    reason: string;
    changes: SponsorChange[];
    contact: boolean;
  })[];
  ownerName?: string;
  reason?: string;
};

export type SponsorChange = {
  label: string;
  before: string | null;
  after: string;
};

export const normalizeSponsorName = (value: string) =>
  value
    .normalize("NFC")
    .toLocaleLowerCase("da-DK")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const digits = (value: string | null | undefined) =>
  value?.replace(/\D/g, "") ?? "";
const cvr = (value: string | null | undefined) =>
  /^\d{8}$/.test(digits(value)) ? digits(value) : "";
const phone = (value: string | null | undefined) =>
  digits(value).replace(/^45(?=\d{8}$)/, "");

function groupSponsorRows(rows: SponsorRow[]) {
  const byName = new Map<string, SponsorRow[]>();
  for (const row of rows) {
    const name = normalizeSponsorName(row.fields.name);
    const group = byName.get(name) ?? [];
    group.push(row);
    byName.set(name, group);
  }
  const merged = new Map<
    SponsorRow,
    {
      row: SponsorRow;
      additionalRows: NonNullable<SponsorProposal["additionalRows"]>;
    }
  >();
  const consumed = new Set<SponsorRow>();
  for (const group of byName.values()) {
    if (group.length < 2 || group.some(({ warnings }) => warnings.length))
      continue;
    const values = (get: (row: SponsorRow) => string | undefined) =>
      new Set(group.map(get).filter(Boolean));
    const numbers = values(({ fields }) => cvr(fields.cvr_number));
    const emails = values(({ fields }) => fields.email?.toLowerCase());
    const sameNumber =
      numbers.size === 1 && group.every(({ fields }) => cvr(fields.cvr_number));
    const sameEmail =
      emails.size === 1 && group.every(({ fields }) => fields.email);
    if (numbers.size > 1 || emails.size > 1 || (!sameNumber && !sameEmail))
      continue;
    const [first, ...rest] = group;
    const combined: SponsorRow = {
      ...first,
      fields: { ...first.fields },
      details: [...first.details],
    };
    for (const row of rest) {
      const source = `${row.source}, række ${row.row}`;
      for (const key of Object.keys(sponsorFields) as SponsorField[]) {
        const incoming = row.fields[key];
        if (!incoming) continue;
        if (!combined.fields[key]) combined.fields[key] = incoming;
        else if (combined.fields[key] !== incoming) {
          combined.details.push([
            `${source} · ${sponsorFields[key]}`,
            incoming,
          ]);
          if (
            key !== "notes" &&
            key !== "name" &&
            normalizeSponsorName(combined.fields[key]!) !==
              normalizeSponsorName(incoming) &&
            !(
              key === "cvr_number" &&
              cvr(combined.fields[key]) === cvr(incoming)
            )
          ) {
            combined.warnings = [
              ...new Set([
                ...combined.warnings,
                `Forskellige værdier for ${sponsorFields[key]}`,
              ]),
            ];
          }
        }
      }
      if (!combined.owner) combined.owner = row.owner;
      else if (
        row.owner &&
        normalizeSponsorName(combined.owner) !== normalizeSponsorName(row.owner)
      ) {
        combined.warnings = [
          ...new Set([...combined.warnings, "Forskellige interne ansvarlige"]),
        ];
        combined.details.push([`${source} · Intern ansvarlig`, row.owner]);
      }
      if (!combined.contact) combined.contact = row.contact;
      else if (
        row.contact &&
        normalizeSponsorName(combined.contact) !==
          normalizeSponsorName(row.contact)
      ) {
        combined.warnings = [
          ...new Set([...combined.warnings, "Forskellige kontaktpersoner"]),
        ];
        combined.details.push([`${source} · Kontaktperson`, row.contact]);
      }
      combined.details.push(
        ...row.details.map(([label, value]): [string, string] => [
          `${source} · ${label}`,
          value,
        ]),
      );
      consumed.add(row);
    }
    merged.set(first, {
      row: combined,
      additionalRows: rest.map(({ source, row }) => ({ source, row })),
    });
  }
  return rows
    .filter((row) => !consumed.has(row))
    .map((row) => merged.get(row) ?? { row, additionalRows: undefined });
}

export function proposeSponsors(
  rows: SponsorRow[],
  existing: SponsorRecord[],
  owners: Map<string, string> = new Map(),
): SponsorProposal[] {
  const workbookNames = new Map<string, number>();
  const workbookCvrs = new Map<string, number>();
  const groups = groupSponsorRows(rows);
  for (const {
    row: { fields },
  } of groups) {
    const name = normalizeSponsorName(fields.name);
    const number = cvr(fields.cvr_number);
    workbookNames.set(name, (workbookNames.get(name) ?? 0) + 1);
    if (number) workbookCvrs.set(number, (workbookCvrs.get(number) ?? 0) + 1);
  }
  return groups.map(({ row, additionalRows }) => {
    const fields = row.fields;
    const ownerId = row.owner
      ? owners.get(normalizeSponsorName(row.owner))
      : undefined;
    const unresolvedOwner = row.owner && !ownerId;
    const name = normalizeSponsorName(fields.name);
    const number = cvr(fields.cvr_number);
    const email = fields.email?.toLowerCase();
    const telephone = phone(fields.phone);
    const address = normalizeSponsorName(fields.address_line ?? "");
    const matches = existing.flatMap((entry) => {
      const sameCvr = Boolean(number && cvr(entry.cvr_number) === number);
      const sameName = normalizeSponsorName(entry.name) === name;
      const sameEmail = Boolean(email && entry.email?.toLowerCase() === email);
      const samePhone = Boolean(
        telephone.length >= 8 && phone(entry.phone) === telephone,
      );
      const sameAddress = Boolean(
        address &&
        fields.postal_code &&
        entry.postal_code === fields.postal_code &&
        normalizeSponsorName(entry.address_line ?? "") === address,
      );
      const conflict = Boolean(number && cvr(entry.cvr_number) && !sameCvr);
      const reason = [
        sameCvr && "CVR",
        sameName && "Firmanavn",
        sameEmail && "E-mail",
        samePhone && "Telefon",
        sameAddress && "Adresse",
        conflict && "Forskelligt CVR",
      ]
        .filter(Boolean)
        .join(" · ");
      const changes: SponsorChange[] = (
        Object.keys(sponsorFields) as SponsorField[]
      ).flatMap((key) => {
        const after = fields[key];
        return after && entry[key] !== after
          ? [{ label: sponsorFields[key], before: entry[key], after }]
          : [];
      });
      if (ownerId && ownerId !== entry.internal_owner_user_id) {
        const previous = [...owners.entries()].find(
          ([, id]) => id === entry.internal_owner_user_id,
        )?.[0];
        changes.push({
          label: "Intern ansvarlig",
          before: previous ?? null,
          after: row.owner!,
        });
      }
      const contact = Boolean(
        row.contact &&
        !entry.contacts?.includes(normalizeSponsorName(row.contact)),
      );
      return sameCvr || sameName || sameEmail || samePhone || sameAddress
        ? [
            {
              candidate: {
                id: entry.id,
                name: entry.name,
                cvr_number: entry.cvr_number,
                city: entry.city,
                reason,
                changes,
                contact,
                archived: Boolean(entry.archived_at),
              },
              addressOnly:
                sameAddress &&
                !sameCvr &&
                !sameName &&
                !sameEmail &&
                !samePhone,
              strong:
                !entry.archived_at &&
                !conflict &&
                (sameCvr ||
                  (sameName && (sameEmail || samePhone || sameAddress))),
            },
          ]
        : [];
    });
    const strong = matches.filter((match) => match.strong);
    const relevant =
      strong.length === 1
        ? matches.filter((match) => !match.addressOnly)
        : matches;
    const candidates = relevant.map(({ candidate }) => candidate);
    const duplicate =
      (workbookNames.get(name) ?? 0) > 1 ||
      (number && (workbookCvrs.get(number) ?? 0) > 1);
    const ownerName = ownerId ? row.owner : undefined;
    if (
      duplicate ||
      unresolvedOwner ||
      row.warnings.length ||
      relevant.length > 1 ||
      (relevant.length === 1 && !relevant[0].strong)
    )
      return {
        row,
        additionalRows,
        candidates,
        ownerName,
        kind: "review",
        reason: duplicate
          ? "Flere rækker i filen kan være samme sponsor"
          : row.warnings.length
            ? row.warnings.join(" · ")
            : unresolvedOwner
              ? "Intern ansvarlig blev ikke fundet entydigt"
              : "Tjek matchet",
      };
    return {
      row,
      additionalRows,
      candidates,
      ownerName,
      kind: !relevant.length
        ? "new"
        : candidates[0].changes.length || candidates[0].contact
          ? "update"
          : "unchanged",
    };
  });
}
