import { notFound } from "next/navigation";

import { AgendaItemEditForm } from "@/components/agenda-items/agenda-item-edit-form";
import { Breadcrumbs, PageHeader } from "@/components/ui";
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
    <div className="max-w-3xl">
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: allowed.committee.name, href: root },
          { label: "Dagsordenspunkter", href: `${root}/agenda-items` },
          {
            label: item.title,
            href: `${root}/agenda-items/${agendaItemId}`,
          },
          { label: "Rediger" },
        ]}
        mobileBack={{
          label: "dagsordenspunktet",
          href: `${root}/agenda-items/${agendaItemId}`,
        }}
      />
      <PageHeader
        className="mb-6"
        description="Opdater emnet uden at miste dets mødehistorik."
        eyebrow="Dagsordenspunkt"
        title="Rediger dagsordenspunkt"
      />
      <div className="border-y border-line py-5">
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
