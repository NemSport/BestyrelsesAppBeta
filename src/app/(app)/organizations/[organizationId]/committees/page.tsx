import Link from "next/link";
import { notFound } from "next/navigation";

import {
  EmptyState,
  PageHeader,
  buttonClassName,
} from "@/components/ui";
import { isOrganizationAdmin } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { CommitteeService } from "@/services/committee-service";

export default async function CommitteesPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db)
    .requireOrganizationMember(organizationId, user.id)
    .catch(() => null);

  if (!context) notFound();

  const committees = await new CommitteeService(db).list(organizationId);
  const canCreate = isOrganizationAdmin(context.membership.role);
  const root = `/organizations/${organizationId}/committees`;
  const createAction = (
    <Link className={buttonClassName()} href={`${root}/new`}>
      Nyt udvalg
    </Link>
  );

  return (
    <div className="section-stack">
      <PageHeader
        actions={canCreate ? createAction : undefined}
        description="Åbn et udvalg for at se møder, dagsordenspunkter og det løbende arbejde."
        eyebrow="Organisation"
        title="Udvalg"
      />

      {committees.length > 0 ? (
        <div className="divide-y divide-line border-y border-line">
          {committees.map((committee) => (
            <article
              className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={committee.id}
            >
              <div className="min-w-0">
                <Link
                  className="text-base font-semibold text-ink hover:text-brand hover:underline"
                  href={`${root}/${committee.id}`}
                >
                  {committee.name}
                </Link>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">
                  {committee.description || "Der er endnu ingen beskrivelse af udvalget."}
                </p>
              </div>
              <Link
                className={buttonClassName({ variant: "secondary", size: "sm" })}
                href={`${root}/${committee.id}`}
              >
                Åbn udvalg
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          action={canCreate ? createAction : undefined}
          description={
            canCreate
              ? "Opret organisationens første udvalg for at komme i gang med møder og dagsordener."
              : "En ejer eller administrator kan oprette organisationens første udvalg."
          }
          title="Organisationen har endnu ingen udvalg."
        />
      )}
    </div>
  );
}
