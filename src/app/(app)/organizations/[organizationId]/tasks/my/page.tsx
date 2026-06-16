import { OrganizationNav } from "@/components/layout/organization-nav";
import { MyTasks } from "@/components/tasks/my-tasks";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { TaskService } from "@/services/task-service";

export default async function MyTasksPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const data = await new TaskService(await createClient()).getMyTasks(
    organizationId,
  );

  return (
    <div>
      <OrganizationNav organizationId={organizationId} />
      <PageHeader
        className="mb-8"
        description="Se hvad der haster, hvad der afventer, og hvilke opgaver du selv har ansvaret for."
        eyebrow="Personligt ansvar"
        title="Mine opgaver"
      />
      <MyTasks
        data={{
          tasks: data.tasks,
          editableCommitteeIds: data.editableCommitteeIds,
        }}
        organizationId={organizationId}
        userId={data.userId}
      />
    </div>
  );
}
