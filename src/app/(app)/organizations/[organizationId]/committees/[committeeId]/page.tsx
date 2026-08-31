import Link from "next/link";

import { AppIcon, type AppIconName } from "@/components/icons/app-icon";
import { TrashActionButton } from "@/components/trash/trash-action-button";
import {
  ActionMenu,
  EmptyState,
  PageHeader,
  StatusBadge,
  buttonClassName,
} from "@/components/ui";
import { documentFileType } from "@/lib/document-register";
import {
  committeeRoleLabels,
  formatDate,
  formatDateTime,
} from "@/lib/localization";
import { getMeetingCapabilities } from "@/lib/meeting-capabilities";
import { getMeetingAgendaPointHref } from "@/lib/meeting-navigation";
import { isOrganizationAdmin } from "@/lib/permissions";
import {
  getTaskDeadlineState,
  taskStatusLabels,
  taskStatusTones,
} from "@/lib/tasks";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import { CommitteeService } from "@/services/committee-service";
import type {
  AnnualWheelEventView,
  CommitteeWorkspaceActivity,
} from "@/types/domain";

const menuLink =
  "flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const localNavLink =
  "inline-flex min-h-10 items-center border-b-2 px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

const activityStatusLabels: Record<AnnualWheelEventView["status"], string> = {
  planned: "Planlagt",
  in_progress: "I gang",
  completed: "Gennemført",
  postponed: "Udsat",
  cancelled: "Annulleret",
};

function activitySecondaryMetadata(event: AnnualWheelEventView) {
  return [event.category?.trim(), activityStatusLabels[event.status]]
    .filter(Boolean)
    .join(" · ");
}

function activitySentence(item: CommitteeWorkspaceActivity) {
  if (item.kind === "meeting") return `Mødet “${item.title}” blev opdateret`;
  if (item.kind === "task") {
    return item.detail === "Opgave gennemført"
      ? `Opgaven “${item.title}” blev gennemført`
      : `Opgaven “${item.title}” blev opdateret`;
  }
  if (item.kind === "decision") {
    return `Beslutningen “${item.title}” blev registreret eller opdateret`;
  }
  if (item.kind === "document") {
    return `Dokumentet “${item.title}” blev uploadet eller opdateret`;
  }
  return `Aktiviteten “${item.title}” blev oprettet eller opdateret`;
}

function SectionHeading({
  title,
  href,
  linkLabel,
  titleId,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  titleId?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-ink" id={titleId}>
        {title}
      </h2>
      {href && linkLabel ? (
        <Link
          className="text-sm font-semibold text-brand hover:underline"
          href={href}
        >
          {linkLabel} →
        </Link>
      ) : null}
    </div>
  );
}

function WorkspaceLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: AppIconName;
  children: React.ReactNode;
}) {
  return (
    <Link className={menuLink} href={href}>
      <AppIcon name={icon} size={16} />
      {children}
    </Link>
  );
}

export default async function CommitteeWorkspacePage({
  params,
}: {
  params: Promise<{ organizationId: string; committeeId: string }>;
}) {
  const { organizationId, committeeId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db).requireCommitteeMember(
    organizationId,
    committeeId,
    user.id,
  );
  const workspace = await new CommitteeService(db).getWorkspace(
    organizationId,
    committeeId,
  );
  const capabilities = getMeetingCapabilities(
    context.organizationMembership.role,
    context.membership?.role ?? null,
  );
  const canManageCommittee = isOrganizationAdmin(
    context.organizationMembership.role,
  );
  const root = `/organizations/${organizationId}`;
  const committeeRoot = `${root}/committees/${committeeId}`;
  const taskHref = `${root}/tasks?scope=all&committee=${committeeId}`;
  const documentHref = `${root}/documents?committee=${committeeId}`;
  const deadlineRank = {
    overdue: 0,
    today: 1,
    soon: 2,
    upcoming: 3,
    none: 4,
    closed: 5,
  };
  const sortedTasks = [...workspace.activeTasks].sort(
    (left, right) =>
      deadlineRank[getTaskDeadlineState(left)] -
      deadlineRank[getTaskDeadlineState(right)],
  );
  const attentionTasks = sortedTasks.filter((task) =>
    ["overdue", "today", "soon"].includes(getTaskDeadlineState(task)),
  );
  const overdueTasks = attentionTasks.filter(
    (task) => getTaskDeadlineState(task) === "overdue",
  );
  const dueSoonTasks = attentionTasks.filter((task) =>
    ["today", "soon"].includes(getTaskDeadlineState(task)),
  );
  const focus =
    workspace.upcomingActivities.find(
      (event) => event.status === "in_progress",
    ) ??
    workspace.upcomingActivities.find((event) => event.priority === "high") ??
    null;
  const nextMeetingAgendaHref = workspace.nextMeeting
    ? getMeetingAgendaPointHref({
        organizationId,
        committeeId,
        meetingId: workspace.nextMeeting.id,
        occurrenceId:
          workspace.nextMeeting.agenda_item_occurrences[0]?.id ?? null,
      })
    : committeeRoot;

  return (
    <div className="section-stack w-full max-w-none" data-committee-workspace>
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {capabilities.createMeeting || capabilities.editTasks ? (
              <ActionMenu
                ariaLabel="Opret i udvalget"
                label="+ Opret"
                triggerClassName="!border-brand !bg-brand !text-white hover:!border-brand hover:!bg-brand-strong"
              >
                {capabilities.createMeeting ? (
                  <WorkspaceLink
                    href={`${committeeRoot}/meetings/new`}
                    icon="meetingAdd"
                  >
                    Nyt møde
                  </WorkspaceLink>
                ) : null}
                {capabilities.editTasks ? (
                  <WorkspaceLink href={`${taskHref}&create=1`} icon="taskAdd">
                    Ny opgave
                  </WorkspaceLink>
                ) : null}
                {capabilities.editTasks ? (
                  <WorkspaceLink
                    href={`${committeeRoot}/annual-wheel?create=1`}
                    icon="annualWheel"
                  >
                    Ny aktivitet
                  </WorkspaceLink>
                ) : null}
                {capabilities.editTasks ? (
                  <WorkspaceLink
                    href={`${documentHref}&upload=1`}
                    icon="upload"
                  >
                    Upload dokument
                  </WorkspaceLink>
                ) : null}
              </ActionMenu>
            ) : null}
            {canManageCommittee ? (
              <ActionMenu>
                <Link className={menuLink} href={`${committeeRoot}/edit`}>
                  Rediger udvalg
                </Link>
                <Link className={menuLink} href={`${root}/members`}>
                  Administrer medlemmer
                </Link>
                <TrashActionButton
                  confirmMessage="Er du sikker på, at du vil flytte dette til papirkurven? Elementet kan gendannes i 30 dage."
                  endpoint={`/api/committees/${committeeId}?organizationId=${organizationId}`}
                  label="Flyt udvalg til papirkurv"
                  pendingLabel="Flytter..."
                  redirectTo={root}
                />
              </ActionMenu>
            ) : null}
          </div>
        }
        description={`${workspace.members.length} ${workspace.members.length === 1 ? "medlem" : "medlemmer"}${workspace.committee.description ? ` · ${workspace.committee.description}` : ""}`}
        eyebrow="Udvalgsarbejdsrum"
        title={workspace.committee.name}
      />

      <nav
        aria-label="Arbejdsrummets navigation"
        className="flex flex-wrap gap-x-1 border-b border-line"
      >
        <Link
          aria-current="page"
          className={`${localNavLink} border-brand bg-brand-soft/50 text-brand`}
          href={committeeRoot}
        >
          Overblik
        </Link>
        <Link
          className={`${localNavLink} border-transparent text-muted hover:border-line-strong hover:text-ink`}
          href={`${committeeRoot}/meetings`}
        >
          Møder
        </Link>
        <Link
          className={`${localNavLink} border-transparent text-muted hover:border-line-strong hover:text-ink`}
          href={taskHref}
        >
          Opgaver
        </Link>
        <Link
          className={`${localNavLink} border-transparent text-muted hover:border-line-strong hover:text-ink`}
          href={documentHref}
        >
          Dokumenter
        </Link>
        <Link
          className={`${localNavLink} border-transparent text-muted hover:border-line-strong hover:text-ink`}
          href={`${committeeRoot}/annual-wheel`}
        >
          Aktiviteter
        </Link>
      </nav>

      {focus ? (
        <section
          className="rounded-[var(--radius-panel)] border border-brand/20 bg-brand-soft p-5 sm:p-6"
          aria-labelledby="focus-title"
          data-workspace-focus
        >
          <p className="page-eyebrow">Aktuelt fokus</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h2
                className="text-lg font-semibold leading-snug text-ink sm:text-xl"
                id="focus-title"
              >
                {focus.title}
              </h2>
              <p className="mt-1 text-xs font-medium text-muted sm:text-sm">
                Næste aktivitet · {formatDate(focus.starts_on)}
              </p>
            </div>
            <Link
              className={buttonClassName({ variant: "secondary", size: "sm" })}
              href={`${committeeRoot}/annual-wheel?event=${focus.id}`}
            >
              Se aktivitet
            </Link>
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
        <section
          className="self-start rounded-[var(--radius-panel)] border border-line bg-surface p-5"
          aria-labelledby="attention-title"
        >
          <div>
            <SectionHeading
              href={attentionTasks.length ? taskHref : undefined}
              linkLabel={attentionTasks.length ? "Se alle opgaver" : undefined}
              title="Kræver opmærksomhed"
              titleId="attention-title"
            />
            {attentionTasks.length ? (
              <>
                <p
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line pb-3 text-sm text-muted"
                  data-attention-summary
                >
                  <span>
                    <strong className="font-semibold text-danger">
                      {overdueTasks.length}
                    </strong>{" "}
                    {overdueTasks.length === 1 ? "forsinket" : "forsinkede"}
                  </span>
                  <span aria-hidden="true" className="text-line-strong">
                    ·
                  </span>
                  <span>
                    <strong className="font-semibold text-warning">
                      {dueSoonTasks.length}
                    </strong>{" "}
                    med deadline snart
                  </span>
                </p>
                <div className="mt-3 divide-y divide-line">
                  {attentionTasks.slice(0, 2).map((task) => {
                    const state = getTaskDeadlineState(task);
                    return (
                      <article className="py-2.5" key={task.id}>
                        <Link
                          className="font-semibold hover:text-brand hover:underline"
                          href={`${taskHref}&editTask=${task.id}#task-${task.id}`}
                        >
                          {task.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted">
                          {state === "overdue"
                            ? "Opgave overskredet"
                            : state === "today"
                              ? "Deadline i dag"
                              : "Deadline denne uge"}
                          {task.deadline
                            ? ` · ${formatDate(task.deadline)}`
                            : ""}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="border-t border-line pt-3 text-sm text-muted">
                Ingen akutte punkter
              </p>
            )}
          </div>
        </section>
        <section
          className="rounded-[var(--radius-panel)] border border-brand/20 bg-surface p-5 sm:p-6"
          aria-labelledby="next-meeting-title"
        >
          <div>
            <SectionHeading title="Næste møde" titleId="next-meeting-title" />
            {workspace.nextMeeting ? (
              <div>
                <h3 className="text-lg font-semibold">
                  {workspace.nextMeeting.title}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {formatDateTime(workspace.nextMeeting.starts_at)}
                  {workspace.nextMeeting.location
                    ? ` · ${workspace.nextMeeting.location}`
                    : ""}
                </p>
                <p className="mt-2 text-sm">
                  {workspace.nextMeeting.agenda_item_occurrences.length}{" "}
                  {workspace.nextMeeting.agenda_item_occurrences.length === 1
                    ? "dagsordenspunkt"
                    : "dagsordenspunkter"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    className={buttonClassName({ size: "sm" })}
                    href={`${committeeRoot}/meetings/${workspace.nextMeeting.id}`}
                  >
                    Åbn møde
                  </Link>
                  <Link
                    className={buttonClassName({
                      variant: "secondary",
                      size: "sm",
                    })}
                    href={nextMeetingAgendaHref}
                  >
                    Se dagsorden
                  </Link>
                </div>
              </div>
            ) : (
              <EmptyState
                compact
                action={
                  capabilities.createMeeting ? (
                    <Link
                      className={buttonClassName({ size: "sm" })}
                      href={`${committeeRoot}/meetings/new`}
                    >
                      Opret møde
                    </Link>
                  ) : undefined
                }
                title="Intet kommende møde planlagt"
              />
            )}
          </div>
        </section>
      </div>

      <section
        className="panel p-5 sm:p-6"
        aria-labelledby="active-tasks-title"
      >
        <div>
          <SectionHeading
            href={taskHref}
            linkLabel="Se alle opgaver"
            title="Aktive opgaver"
            titleId="active-tasks-title"
          />
          {sortedTasks.length ? (
            <div className="divide-y divide-line">
              {sortedTasks.slice(0, 6).map((task) => (
                <article
                  className="grid gap-2 py-3 first:pt-0 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,.5fr)_auto] sm:items-center"
                  key={task.id}
                >
                  <Link
                    className="min-w-0 truncate font-semibold hover:text-brand hover:underline"
                    href={`${taskHref}&editTask=${task.id}#task-${task.id}`}
                  >
                    {task.title}
                  </Link>
                  <p className="truncate text-sm text-muted">
                    {task.responsible?.full_name ?? "Ikke fordelt"}
                    {task.deadline ? ` · ${formatDate(task.deadline)}` : ""}
                  </p>
                  <StatusBadge
                    tone={
                      getTaskDeadlineState(task) === "overdue"
                        ? "danger"
                        : taskStatusTones[task.status]
                    }
                  >
                    {getTaskDeadlineState(task) === "overdue"
                      ? "Forsinket"
                      : taskStatusLabels[task.status]}
                  </StatusBadge>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState compact title="Ingen aktive opgaver" />
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel p-5" aria-labelledby="upcoming-title">
          <div>
            <SectionHeading
              href={`${committeeRoot}/annual-wheel`}
              linkLabel="Se kalender"
              title="Kommende aktiviteter"
              titleId="upcoming-title"
            />
            {workspace.upcomingActivities.length ? (
              <div className="divide-y divide-line">
                {workspace.upcomingActivities.slice(0, 5).map((event) => {
                  const secondaryMetadata = activitySecondaryMetadata(event);
                  return (
                    <Link
                      className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-3 py-3 first:pt-0 hover:text-brand"
                      href={`${committeeRoot}/annual-wheel?event=${event.id}`}
                      key={event.id}
                    >
                      <span className="text-xs font-semibold uppercase text-muted">
                        {new Intl.DateTimeFormat("da-DK", {
                          day: "2-digit",
                          month: "short",
                        }).format(new Date(`${event.starts_on}T12:00:00`))}
                      </span>
                      <span className="min-w-0">
                        <span className="block break-words font-semibold leading-snug">
                          {event.title}
                        </span>
                        {secondaryMetadata ? (
                          <span className="mt-1 block break-words text-xs leading-relaxed text-muted">
                            {secondaryMetadata}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState compact title="Ingen kommende aktiviteter" />
            )}
          </div>
        </section>
        <section className="panel p-5" aria-labelledby="documents-title">
          <div>
            <SectionHeading
              href={documentHref}
              linkLabel="Se dokumenter"
              title="Seneste dokumenter"
              titleId="documents-title"
            />
            {workspace.recentDocuments.length ? (
              <div className="divide-y divide-line">
                {workspace.recentDocuments.slice(0, 4).map((document) => (
                  <Link
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 hover:text-brand"
                    href={`${root}/documents/${document.id}`}
                    key={document.id}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {document.name}
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {documentFileType(
                          document.mimeType ?? undefined,
                          document.fileName ?? undefined,
                        )}{" "}
                        · {formatDate(document.updatedAt)}
                      </span>
                    </span>
                    <AppIcon
                      className="shrink-0 text-muted"
                      name="arrowRight"
                      size={15}
                    />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                action={
                  capabilities.editTasks ? (
                    <Link
                      className={buttonClassName({ size: "sm" })}
                      href={`${documentHref}&upload=1`}
                    >
                      Upload dokument
                    </Link>
                  ) : undefined
                }
                title="Ingen dokumenter i udvalget endnu"
              />
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,.55fr)]">
        <section className="panel p-5" aria-labelledby="history-title">
          <div>
            <SectionHeading title="Seneste aktivitet" titleId="history-title" />
            {workspace.recentActivity.length ? (
              <ol className="divide-y divide-line">
                {workspace.recentActivity.map((item) => (
                  <li
                    className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[7rem_minmax(0,1fr)]"
                    key={item.id}
                  >
                    <time
                      className="text-xs font-semibold uppercase text-muted"
                      dateTime={item.occurredAt}
                    >
                      {formatDate(item.occurredAt)}
                    </time>
                    <div>
                      <Link
                        className="font-semibold hover:text-brand hover:underline"
                        href={item.href}
                      >
                        {activitySentence(item)}
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState compact title="Ingen aktivitet registreret endnu" />
            )}
          </div>
        </section>
        <section className="panel p-5" aria-labelledby="members-title">
          <div>
            <SectionHeading
              href={canManageCommittee ? `${root}/members` : undefined}
              linkLabel={canManageCommittee ? "Administrer" : undefined}
              title={`${workspace.members.length} ${workspace.members.length === 1 ? "medlem" : "medlemmer"}`}
              titleId="members-title"
            />
            <div className="space-y-3">
              {workspace.members.map((member) => (
                <div
                  className="flex min-w-0 items-center gap-3"
                  key={member.userId}
                >
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand"
                  >
                    {member.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {member.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {committeeRoleLabels[member.role]}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
