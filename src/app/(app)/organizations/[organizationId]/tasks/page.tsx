import { TaskRegister } from "@/components/tasks/task-register";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { TaskService } from "@/services/task-service";

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{
    create?: string;
    stakeholderId?: string;
    stakeholderContractId?: string;
  }>;
}) {
  const { organizationId } = await params;
  const { create, stakeholderId, stakeholderContractId } = await searchParams;
  const data = await new TaskService(await createClient()).getRegister(
    organizationId,
  );

  return (
    <div className="page-flow w-full max-w-none" data-task-register-page>
      <PageHeader
        description="Få overblik over ansvar, deadlines og fremdrift på tværs af organisationen."
        eyebrow="Handling og eksekvering"
        title="Opgaver"
      />
      <TaskRegister
        data={data}
        openCreateOnLoad={create === "1"}
        initialStakeholderId={stakeholderId ?? ""}
        initialStakeholderContractId={stakeholderContractId ?? ""}
        organizationId={organizationId}
      />
    </div>
  );
}
