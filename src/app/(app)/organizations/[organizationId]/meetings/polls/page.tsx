import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader, buttonClassName } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { OrganizationService } from "@/services/organization-service";

export default async function ChoosePollCommittee({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ committee?: string }>;
}) {
  const { organizationId } = await params;
  const { committee: selected } = await searchParams;
  const overview = await new OrganizationService(
    await createClient(),
  ).getOverview(organizationId);
  const committees = overview.committees.filter(
    ({ capabilities }) => capabilities.createMeeting,
  );
  const root = `/organizations/${organizationId}`;
  if (selected) {
    if (!committees.some(({ committee }) => committee.id === selected))
      notFound();
    redirect(`${root}/committees/${selected}/meetings/polls`);
  }

  return (
    <div className="section-stack max-w-2xl">
      <PageHeader title="Datoafstemning" />
      {committees.length ? (
        <form className="panel flex flex-wrap items-end gap-3 p-4">
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold">
            Vælg udvalg
            <select
              name="committee"
              defaultValue=""
              required
              className="field min-h-11"
            >
              <option value="">Vælg udvalg</option>
              {committees.map(({ committee }) => (
                <option key={committee.id} value={committee.id}>
                  {committee.name}
                </option>
              ))}
            </select>
          </label>
          <button className={buttonClassName()} type="submit">
            Fortsæt
          </button>
        </form>
      ) : (
        <p>Du har ingen udvalg, hvor du kan oprette en datoafstemning.</p>
      )}
      <Link
        className="text-sm font-semibold text-brand underline"
        href={`${root}/meetings`}
      >
        Tilbage til mødeoversigten
      </Link>
    </div>
  );
}
