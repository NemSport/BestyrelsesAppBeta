import Link from "next/link";
import { notFound } from "next/navigation";

import {
  EmptyState,
  PageHeader,
  StatusBadge,
  buttonClassName,
  interactiveSurfaceClassName,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/localization";
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

  const committees = await new CommitteeService(db).listDirectory(
    organizationId,
  );
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
        description="Organisationens arbejdsrum for møder, opgaver og det løbende udvalgsarbejde."
        eyebrow="Organisation"
        title="Udvalg"
      />

      {committees.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2" data-committee-directory>
          {committees.map((item) => {
            const previewMembers = item.members.slice(0, 4);
            const remainingMembers =
              item.members.length - previewMembers.length;
            const nextEvent = item.nextMeeting
              ? {
                  label: "Næste møde",
                  title: item.nextMeeting.title,
                  date: formatDateTime(item.nextMeeting.starts_at),
                }
              : item.nextActivity
                ? {
                    label: "Næste aktivitet",
                    title: item.nextActivity.title,
                    date: formatDate(item.nextActivity.starts_on),
                  }
                : null;

            return (
              <article key={item.committee.id}>
                <Link
                  aria-label={`Åbn arbejdsrummet ${item.committee.name}`}
                  className={interactiveSurfaceClassName(
                    "flex h-full min-w-0 flex-col p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                  )}
                  href={`${root}/${item.committee.id}`}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words text-xl font-semibold leading-7 text-ink group-hover:text-brand group-hover:underline">
                        {item.committee.name}
                      </h2>
                      <p className="mt-1 line-clamp-3 text-sm leading-6 text-muted md:line-clamp-2">
                        {item.committee.description ||
                          "Arbejdsrum for udvalgets møder og løbende opgaver."}
                      </p>
                    </div>
                    <StatusBadge
                      className="shrink-0"
                      tone={item.overdueTaskCount > 0 ? "warning" : "success"}
                    >
                      {item.overdueTaskCount > 0
                        ? "Kræver handling"
                        : "Roligt"}
                    </StatusBadge>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-sm text-muted">
                    <span>
                      <strong className="font-semibold text-ink">
                        {item.activeTaskCount}
                      </strong>{" "}
                      aktive opgaver
                    </span>
                    <span>
                      <strong className="font-semibold text-ink">
                        {item.upcomingMeetingCount}
                      </strong>{" "}
                      kommende møder
                    </span>
                  </div>

                  {nextEvent ? (
                    <div className="mt-4 min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        {nextEvent.label}
                      </p>
                      <p className="mt-1 line-clamp-1 text-sm font-semibold text-ink">
                        {nextEvent.title}
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {nextEvent.date}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted">
                      Ingen kommende møder eller aktiviteter.
                    </p>
                  )}

                  <div className="mt-auto flex min-w-0 items-center justify-between gap-3 pt-5">
                    <div className="flex min-w-0 items-center">
                      <div className="flex -space-x-2" aria-hidden="true">
                        {previewMembers.map((member) => (
                          <span
                            className="grid size-8 place-items-center rounded-full border-2 border-surface bg-subtle text-[11px] font-semibold text-ink"
                            key={member.userId}
                            title={member.name}
                          >
                            {member.name
                              .split(/\s+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part) => part[0]?.toUpperCase())
                              .join("") || "?"}
                          </span>
                        ))}
                        {remainingMembers > 0 ? (
                          <span className="grid size-8 place-items-center rounded-full border-2 border-surface bg-subtle text-[11px] font-semibold text-muted">
                            +{remainingMembers}
                          </span>
                        ) : null}
                      </div>
                      <span className="ml-3 text-sm text-muted">
                        {item.members.length}{" "}
                        {item.members.length === 1 ? "medlem" : "medlemmer"}
                      </span>
                    </div>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-lg font-semibold text-brand transition-transform group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </div>
                </Link>
              </article>
            );
          })}
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
