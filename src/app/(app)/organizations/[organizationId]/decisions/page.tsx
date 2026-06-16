import { DecisionRegister } from "@/components/decisions/decision-register";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { DecisionService } from "@/services/decision-service";
import { TaskService } from "@/services/task-service";

export default async function DecisionsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const db = await createClient();
  const [data, taskData] = await Promise.all([
    new DecisionService(db).getRegister(organizationId),
    new TaskService(db).getRegister(organizationId),
  ]);

  return (
    <>
      <PageHeader
        className="mb-8"
        description="Saml organisationens beslutninger, ansvar og deadlines på tværs af udvalg."
        eyebrow="Organisatorisk hukommelse"
        title="Beslutningsregister"
      />
      <DecisionRegister
        data={data}
        organizationId={organizationId}
        taskData={taskData}
      />
    </>
  );
}
