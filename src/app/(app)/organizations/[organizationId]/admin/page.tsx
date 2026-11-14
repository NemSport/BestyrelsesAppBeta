import { notFound } from "next/navigation";

import { OverviewList } from "@/components/dashboard/overview-list";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";

export default async function AdminOverview({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db)
    .requireOrganizationAdmin(organizationId, user.id)
    .catch(() => null);
  if (!context) notFound();
  const { data, error } = await db.rpc("read_admin_overview", {
    target_org: organizationId,
  });
  if (error) throw error;
  const sections = [
    [
      "waiting",
      "Afventer handling eller svar",
      "Ingen sager afventer handling eller svar.",
    ],
    ["overdue", "Overskredne opgaver", "Ingen overskredne opgaver."],
    [
      "recent",
      "Seneste svar og statusopdateringer",
      "Ingen svar eller statusopdateringer de seneste 30 dage.",
    ],
  ] as const;

  return (
    <div className="page-flow">
      <PageHeader title="Adminoverblik" />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {sections.map(([id, title, empty]) => {
          const rows = data.filter(({ section }) => section === id);
          return (
            <section key={id} aria-labelledby={id} className="panel p-4">
              <h2 id={id} className="mb-2 font-semibold">
                {title}{" "}
                <span className="text-sm font-normal text-muted">
                  ({rows.length})
                </span>
              </h2>
              <OverviewList
                empty={empty}
                rows={rows.map((item) => ({
                  id: item.item_id,
                  title: item.title,
                  detail: item.detail,
                  href: `/organizations/${organizationId}${item.path}`,
                  date: id === "recent" ? item.occurred_at : undefined,
                }))}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}
