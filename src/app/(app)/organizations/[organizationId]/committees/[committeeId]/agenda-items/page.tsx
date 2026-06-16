import Link from "next/link";

import { AgendaItemDocumentTitle } from "@/components/agenda-items/agenda-item-document-title";
import { canEditAgendaItems } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { AgendaItemService } from "@/services/agenda-item-service";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";

export default async function AgendaItemsPage({
  params,
}: {
  params: Promise<{ organizationId: string; committeeId: string }>;
}) {
  const { organizationId, committeeId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db).requireCommitteeMember(
    organizationId,
    committeeId,
    user.id,
  );
  const items = await new AgendaItemService(db).list(organizationId, committeeId);
  const root = `/organizations/${organizationId}/committees/${committeeId}`;
  const canEdit = canEditAgendaItems(
    context.organizationMembership.role,
    context.membership?.role ?? null,
  );

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="page-eyebrow">
            Fælles hukommelse
          </p>
          <h2 className="section-title mt-2">Dagsordenspunkter</h2>
          <p className="metadata mt-2 max-w-2xl leading-6">
            Emner bevares på tværs af møder, så historikken ikke bliver fragmenteret.
          </p>
        </div>
        {canEdit ? (
          <Link className="button-primary" href={`${root}/agenda-items/new`}>
            Nyt dagsordenspunkt
          </Link>
        ) : null}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <Link
            className="panel p-5 transition hover:border-forest"
            href={`${root}/agenda-items/${item.id}`}
            key={item.id}
          >
            <h3 className="font-semibold">
              <AgendaItemDocumentTitle
                title={item.title}
                type={item.item_type}
              />
            </h3>
            <p className="mt-3 line-clamp-2 text-sm text-slate-600">
              {item.objective || item.description || "Der er endnu ikke angivet et formål."}
            </p>
            <p className="mt-4 text-xs text-slate-500">
              {item.agenda_item_occurrences.length}{" "}
              {item.agenda_item_occurrences.length === 1
                ? "mødeforekomst"
                : "mødeforekomster"}
            </p>
          </Link>
        ))}
        {items.length === 0 ? (
          <div className="panel p-5 text-sm text-slate-600">
            Der er endnu ikke oprettet nogen dagsordenspunkter.
          </div>
        ) : null}
      </div>
    </section>
  );
}
