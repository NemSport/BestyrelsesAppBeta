import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getStakeholderCapabilities } from "@/lib/stakeholder-capabilities";
import {
  normalizeSponsorName,
  proposeSponsors,
  sponsorRow,
} from "@/lib/sponsor-import";
import { createClient } from "@/lib/supabase/server";
import { OrganizationMemberRepository } from "@/repositories/organization-member-repository";
import { StakeholderRepository } from "@/repositories/stakeholder-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Json } from "@/types/database";

const payload = z.object({
  rows: z.array(sponsorRow).min(1).max(500),
  approval: z
    .object({
      revision: z.string().regex(/^[a-f0-9]{64}$/),
      selections: z.record(z.union([z.literal("new"), z.string().uuid()])),
    })
    .optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const organizationId = z
      .string()
      .uuid()
      .parse((await params).organizationId);
    const db = await createClient();
    const user = await new AuthService(db).requireUser();
    const { membership } = await new AuthorizationService(
      db,
    ).requireOrganizationMember(organizationId, user.id);
    if (!getStakeholderCapabilities(membership.role).createStakeholders)
      throw new AppError("Du har ikke adgang til at importere sponsorer.", 403);

    const { rows, approval } = payload.parse(await request.json());
    const repository = new StakeholderRepository(db);
    const [stakeholders, contacts, members] = await Promise.all([
      repository.listStakeholders(organizationId, true),
      repository.listContacts(organizationId),
      new OrganizationMemberRepository(db).listMembers(organizationId),
    ]);
    const contactsBySponsor = new Map<string, string[]>();
    for (const contact of contacts) {
      const names = contactsBySponsor.get(contact.stakeholder_id) ?? [];
      names.push(normalizeSponsorName(contact.name));
      contactsBySponsor.set(contact.stakeholder_id, names);
    }
    const owners = new Map<string, string>();
    const ambiguous = new Set<string>();
    for (const member of members) {
      if (member.status !== "active" || !member.full_name) continue;
      const name = normalizeSponsorName(member.full_name);
      if (owners.has(name)) ambiguous.add(name);
      owners.set(name, member.user_id);
    }
    ambiguous.forEach((name) => owners.delete(name));

    const proposals = proposeSponsors(
      rows,
      stakeholders
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((entry) => ({
          ...entry,
          contacts: contactsBySponsor.get(entry.id),
        })),
      owners,
    );
    const revisions = new Map(
      stakeholders.map(({ id, updated_at }) => [id, updated_at]),
    );
    const revision = createHash("sha256")
      .update(
        JSON.stringify([
          proposals,
          proposals.flatMap(({ candidates }) =>
            candidates.map(({ id }) => revisions.get(id)),
          ),
          rows.map(
            ({ owner }) => owner && owners.get(normalizeSponsorName(owner)),
          ),
        ]),
      )
      .digest("hex");
    if (!approval) return NextResponse.json({ proposals, revision });
    if (revision !== approval.revision)
      throw new AppError(
        "Interessentregistret har ændret sig. Beregn forslagene igen.",
        409,
      );

    const targets = new Set<string>();
    const writes = proposals.flatMap(({ row, candidates, kind }, index) => {
      const selected = approval.selections[index];
      if (!selected || kind === "unchanged") return [];
      const candidate = candidates.find(({ id }) => id === selected);
      if (selected === "new" && kind === "update")
        throw new AppError("Brug det foreslåede match til denne sponsor.", 422);
      if (selected !== "new" && (!candidate || candidate.archived))
        throw new AppError("Et valgt match er ikke længere tilgængeligt.", 409);
      const key =
        candidate?.id ?? `new:${normalizeSponsorName(row.fields.name)}`;
      const cvr = row.fields.cvr_number?.replace(/\D/g, "");
      const numberKey = cvr && `cvr:${cvr}`;
      if (targets.has(key) || (numberKey && targets.has(numberKey)))
        throw new AppError(
          "Du har valgt flere rækker til samme sponsor. Fjern den ene markering.",
          422,
        );
      targets.add(key);
      if (numberKey) targets.add(numberKey);
      return [
        {
          id: candidate?.id,
          version: candidate && revisions.get(candidate.id),
          fields: row.fields,
          owner: row.owner && owners.get(normalizeSponsorName(row.owner)),
          contact: !candidate || candidate.contact ? row.contact : undefined,
        },
      ];
    });
    if (!writes.length) throw new AppError("Vælg mindst én sponsor.", 422);
    const { data, error } = await db.rpc("apply_sponsor_import", {
      target_organization: organizationId,
      operations: writes as Json,
    });
    if (error?.code === "40001" || error?.code === "23505")
      throw new AppError(
        "Interessentregistret har ændret sig. Beregn forslagene igen.",
        409,
      );
    if (error) throw error;
    return NextResponse.json({ saved: data });
  } catch (error) {
    return apiError(error, {
      fallbackMessage: "Sponsorimporten kunne ikke gennemføres.",
    });
  }
}
