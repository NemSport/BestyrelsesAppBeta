import { redirect } from "next/navigation";

export default async function MyTasksPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  redirect(`/organizations/${organizationId}/tasks?mine=1`);
}
