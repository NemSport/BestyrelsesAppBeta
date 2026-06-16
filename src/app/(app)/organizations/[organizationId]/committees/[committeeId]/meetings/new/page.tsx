import { notFound } from "next/navigation";

import { ResourceForm } from "@/components/forms/resource-form";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";

export default async function NewMeetingPage({
  params,
}: {
  params: Promise<{ organizationId: string; committeeId: string }>;
}) {
  const { organizationId, committeeId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const allowed = await new AuthorizationService(db)
    .requireCommitteeManager(organizationId, committeeId, user.id)
    .catch(() => null);
  if (!allowed) notFound();
  const root = `/organizations/${organizationId}/committees/${committeeId}`;
  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="text-2xl font-bold">Opret møde</h2>
      <p className="mt-2 text-sm text-slate-600">
        Mødet oprettes med standardpunkterne Godkendelse af dagsorden,
        Godkendelse af seneste referat og Eventuelt.
      </p>
      <div className="panel mt-6 p-6">
        <ResourceForm
          endpoint={`/api/committees/${committeeId}/meetings`}
          fields={[
            {
              name: "title",
              label: "Titel",
              required: true,
              requiredMessage: "Titel skal udfyldes",
            },
            { name: "description", label: "Beskrivelse", type: "textarea" },
            {
              name: "startsAt",
              label: "Startdato",
              type: "datetime-local",
              required: true,
              requiredMessage: "Startdato mangler",
            },
            { name: "endsAt", label: "Slutdato", type: "datetime-local" },
            { name: "location", label: "Sted" },
          ]}
          hidden={{ organizationId, committeeId }}
          successPath={`${root}/meetings/:id`}
          submitLabel="Opret møde"
        />
      </div>
    </div>
  );
}
