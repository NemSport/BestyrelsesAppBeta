import { TaskRegister } from "@/components/tasks/task-register";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { TaskService } from "@/services/task-service";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const data = await new TaskService(await createClient()).getRegister(
    organizationId,
  );

  return (
    <>
      <PageHeader
        className="mb-8"
        description="Saml organisationens opgaver, ansvar og deadlines på tværs af udvalg."
        eyebrow="Handling og eksekvering"
        title="Opgaver"
      />
      <TaskRegister data={data} organizationId={organizationId} />
    </>
  );
}
