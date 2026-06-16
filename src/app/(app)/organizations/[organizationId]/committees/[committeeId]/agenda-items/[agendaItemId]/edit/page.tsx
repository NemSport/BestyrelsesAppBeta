import { notFound } from "next/navigation";

import { AgendaItemEditForm } from "@/components/agenda-items/agenda-item-edit-form";
import { createClient } from "@/lib/supabase/server";
import { AgendaItemService } from "@/services/agenda-item-service";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";

export default async function EditAgendaItemPage({
  params,
}: {
  params: Promise<{
    organizationId: string;
    committeeId: string;
    agendaItemId: string;
  }>;
}) {
  const { organizationId, committeeId, agendaItemId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const allowed = await new AuthorizationService(db)
    .requireAgendaItemEditor(organizationId, committeeId, user.id)
    .catch(() => null);
  if (!allowed) notFound();
  const item = await new AgendaItemService(db)
    .get(organizationId, committeeId, agendaItemId)
    .catch(() => null);
  if (!item) notFound();
  const root = `/organizations/${organizationId}/committees/${committeeId}`;

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="text-2xl font-bold">Rediger dagsordenspunkt</h2>
      <p className="mt-2 text-sm text-slate-600">
        Opdater emnet uden at miste dets mødehistorik.
      </p>
      <div className="panel mt-6 p-6">
        <AgendaItemEditForm
          committeeId={committeeId}
          item={item}
          organizationId={organizationId}
          successPath={`${root}/agenda-items/${agendaItemId}`}
        />
      </div>
    </div>
  );
}
