import { redirect } from "next/navigation";

export default async function ActionsPage({ params, searchParams }: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { organizationId } = await params;
  const { view } = await searchParams;
  const tab = view === "mine" || view === "completed" ? view : "inbox";
  redirect(`/organizations/${organizationId}?handlinger=${tab}#handlinger`);
}
