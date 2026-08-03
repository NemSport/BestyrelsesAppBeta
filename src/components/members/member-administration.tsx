"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ManualMemberForm } from "@/components/members/manual-member-form";
import { MemberAccessEditor } from "@/components/members/member-access-editor";
import {
  ActionMenu,
  Button,
  EmptyState,
  Input,
  PageSection,
  Select,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import {
  committeeRoleLabels,
  invitationStatusLabels,
  membershipStatusLabels,
  organizationRoleLabels,
} from "@/lib/localization";
import { getMemberAccessCapabilities } from "@/lib/member-access-capabilities";
import type { Database } from "@/types/database";
import type {
  Committee,
  OrganizationInvitation,
  OrganizationMemberDirectoryEntry,
} from "@/types/domain";

type OrganizationRole = Database["public"]["Enums"]["organization_role"];

const allRoleOptions: OrganizationRole[] = [
  "owner",
  "admin",
  "member",
  "viewer",
];
const adminRoleOptions: OrganizationRole[] = ["admin", "member", "viewer"];

export function MemberAdministration({
  organizationId,
  members,
  invitations,
  currentUserId,
  currentUserRole,
  committees,
}: {
  organizationId: string;
  members: OrganizationMemberDirectoryEntry[];
  invitations: OrganizationInvitation[];
  currentUserId: string;
  currentUserRole: OrganizationRole;
  committees: Committee[];
}) {
  const router = useRouter();
  const canManage = currentUserRole === "owner" || currentUserRole === "admin";
  const [email, setEmail] = useState("");
  const [invitationRole, setInvitationRole] =
    useState<OrganizationRole>("member");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const activeOwnerCount = members.filter(
    (member) => member.role === "owner" && member.status === "active",
  ).length;

  async function readResponse(response: Response) {
    const result = (await response.json()) as {
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(result.error || "Handlingen kunne ikke gennemføres.");
    }
    return result;
  }

  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setEmailError(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setEmailError("E-mail skal udfyldes");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailError("Indtast en gyldig e-mailadresse");
      return;
    }

    setLoadingKey("invite");
    try {
      const result = await readResponse(
        await fetch(`/api/organizations/${organizationId}/invitations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: normalizedEmail,
            role: invitationRole,
          }),
        }),
      );
      setEmail("");
      setInvitationRole("member");
      setMessage(result.message || "Invitationen er gemt.");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Invitationen kunne ikke gemmes.",
      );
    } finally {
      setLoadingKey(null);
    }
  }

  async function removeMember(member: OrganizationMemberDirectoryEntry) {
    const label = member.full_name || member.email;
    if (
      !window.confirm(
        `Er du sikker på, at du vil fjerne ${label} fra organisationen? Brugeren mister straks sin adgang.`,
      )
    ) {
      return;
    }

    setMessage(null);
    setError(null);
    setLoadingKey(`remove-${member.user_id}`);
    try {
      const result = await readResponse(
        await fetch(
          `/api/organizations/${organizationId}/members/${member.user_id}`,
          { method: "DELETE" },
        ),
      );
      setMessage(result.message || "Medlemmet er fjernet.");
      if (member.user_id === currentUserId) {
        router.push("/organizations");
      } else {
        router.refresh();
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Medlemmet kunne ikke fjernes.",
      );
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <div className="section-stack">
      {message ? (
        <div
          className="alert-success rounded-xl px-4 py-3 text-sm"
          role="status"
        >
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="alert-danger rounded-xl px-4 py-3 text-sm" role="alert">
          {error}
        </div>
      ) : null}

      {canManage ? (
        <section className="border-l-2 border-brand bg-brand-soft/35 px-4 py-4">
          <h2 className="text-base font-semibold">Inviter medlem</h2>
          <p className="mt-2 text-sm text-muted">
            Invitationen gemmes som afventende. Der sendes endnu ingen e-mail.
          </p>
          <form
            className="mt-5 grid gap-4 md:grid-cols-[1fr_220px_auto]"
            onSubmit={inviteMember}
          >
            <div>
              <label className="label" htmlFor="invitation-email">
                E-mail
              </label>
              <Input
                aria-invalid={Boolean(emailError)}
                id="invitation-email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="navn@eksempel.dk"
                type="email"
                value={email}
              />
              {emailError ? (
                <p className="mt-1 text-sm text-danger">{emailError}</p>
              ) : null}
            </div>
            <div>
              <label className="label" htmlFor="invitation-role">
                Rolle
              </label>
              <Select
                id="invitation-role"
                onChange={(event) =>
                  setInvitationRole(event.target.value as OrganizationRole)
                }
                value={invitationRole}
              >
                {(currentUserRole === "owner"
                  ? allRoleOptions
                  : adminRoleOptions
                ).map((role) => (
                  <option key={role} value={role}>
                    {organizationRoleLabels[role]}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              className="self-end"
              disabled={loadingKey === "invite"}
              type="submit"
            >
              {loadingKey === "invite" ? "Gemmer..." : "Gem invitation"}
            </Button>
          </form>
        </section>
      ) : null}

      {currentUserRole === "owner" ? (
        <ManualMemberForm
          committees={committees}
          organizationId={organizationId}
        />
      ) : null}

      <PageSection
        description="Roller og udvalgstilknytninger for aktive brugere."
        eyebrow="Organisation"
        title="Aktive medlemmer"
      >
        {members.length > 0 ? (
          <TableContainer
            aria-label="Aktive medlemmer"
            className="overflow-visible border-0 bg-transparent md:overflow-x-auto md:border-y"
            tabIndex={-1}
          >
            <Table className="block min-w-0 md:table md:min-w-full">
              <TableHead className="hidden md:table-header-group">
                <TableRow>
                  <TableHeaderCell>Medlem</TableHeaderCell>
                  <TableHeaderCell>Udvalg</TableHeaderCell>
                  <TableHeaderCell>Rolle</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Handlinger</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody className="grid gap-3 md:table-row-group">
                {members.map((member) => {
                  const isSelf = member.user_id === currentUserId;
                  const capabilities = getMemberAccessCapabilities({
                    actorRole: currentUserRole,
                    actorUserId: currentUserId,
                    targetRole: member.role,
                    targetUserId: member.user_id,
                    activeOwnerCount,
                  });

                  return (
                    <TableRow
                      className="grid gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-4 md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent md:p-0"
                      key={member.user_id}
                    >
                      <TableCell className="block min-w-0 p-0 md:table-cell md:min-w-56 md:px-5 md:py-4">
                        <span className="metadata mb-1 block md:hidden">
                          Medlem
                        </span>
                        <p className="break-words font-semibold">
                          {member.full_name || member.email}
                          {isSelf ? (
                            <span className="ml-2 text-xs font-normal text-muted">
                              Dig
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 break-all text-sm text-muted">
                          {member.email}
                        </p>
                      </TableCell>
                      <TableCell className="block min-w-0 p-0 md:table-cell md:min-w-64 md:px-5 md:py-4">
                        <span className="metadata mb-1 block md:hidden">
                          Udvalg
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {member.committees.length > 0 ? (
                            member.committees.map((committee) => (
                              <StatusBadge
                                className="max-w-full whitespace-normal break-words leading-4"
                                key={committee.id}
                                title={committeeRoleLabels[committee.role]}
                              >
                                {committee.name} •{" "}
                                {committeeRoleLabels[committee.role] ||
                                  "Ukendt rolle"}
                              </StatusBadge>
                            ))
                          ) : (
                            <span className="text-muted">Ingen udvalg</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="block min-w-0 p-0 md:table-cell md:min-w-44 md:px-5 md:py-4">
                        <span className="metadata mb-1 block md:hidden">
                          Organisationsrolle
                        </span>
                        {organizationRoleLabels[member.role]}
                      </TableCell>
                      <TableCell className="block min-w-0 p-0 md:table-cell md:px-5 md:py-4">
                        <span className="metadata mb-1 block md:hidden">
                          Status
                        </span>
                        <StatusBadge tone="success">
                          {membershipStatusLabels[member.status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="block min-w-0 border-t border-line pt-3 md:table-cell md:border-t-0 md:px-5 md:py-4">
                        <span className="metadata mb-2 block md:hidden">
                          Handlinger
                        </span>
                        {capabilities.canEditAccess ||
                        capabilities.canRemove ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {capabilities.canEditAccess ? (
                              <MemberAccessEditor
                                committees={committees}
                                member={member}
                                onUpdated={(nextMessage) => {
                                  setError(null);
                                  setMessage(nextMessage);
                                  router.refresh();
                                }}
                                organizationId={organizationId}
                                roleOptions={
                                  capabilities.assignableOrganizationRoles
                                }
                              />
                            ) : null}
                            {capabilities.canRemove ? (
                              <ActionMenu
                                align="right"
                                ariaLabel={`Flere handlinger for ${
                                  member.full_name || member.email
                                }`}
                              >
                                <button
                                  className="block min-h-11 w-full px-3 py-2 text-left text-sm font-semibold text-danger hover:bg-danger-soft"
                                  disabled={
                                    loadingKey === `remove-${member.user_id}`
                                  }
                                  onClick={() => removeMember(member)}
                                  type="button"
                                >
                                  {loadingKey === `remove-${member.user_id}`
                                    ? "Fjerner..."
                                    : "Fjern medlem"}
                                </button>
                              </ActionMenu>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted">Kun læseadgang</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <EmptyState title="Organisationen har endnu ingen medlemmer." />
        )}
      </PageSection>

      <PageSection
        description="Invitationerne bliver stående her, indtil et senere acceptflow tilføjes."
        title="Afventende invitationer"
      >
        {invitations.length > 0 ? (
          <TableContainer
            aria-label="Afventende invitationer"
            className="overflow-visible border-0 bg-transparent md:overflow-x-auto md:border-y"
            tabIndex={-1}
          >
            <Table className="block min-w-0 md:table md:min-w-full">
              <TableHead className="hidden md:table-header-group">
                <TableRow>
                  <TableHeaderCell>E-mail</TableHeaderCell>
                  <TableHeaderCell>Rolle</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody className="grid gap-3 md:table-row-group">
                {invitations.map((invitation) => (
                  <TableRow
                    className="grid gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-4 md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent md:p-0"
                    key={invitation.id}
                  >
                    <TableCell className="block min-w-0 p-0 md:table-cell md:px-5 md:py-4">
                      <span className="metadata mb-1 block md:hidden">
                        E-mail
                      </span>
                      <span className="break-all font-semibold">
                        {invitation.email}
                      </span>
                    </TableCell>
                    <TableCell className="block min-w-0 p-0 md:table-cell md:px-5 md:py-4">
                      <span className="metadata mb-1 block md:hidden">
                        Organisationsrolle
                      </span>
                      {organizationRoleLabels[invitation.role]}
                    </TableCell>
                    <TableCell className="block min-w-0 p-0 md:table-cell md:px-5 md:py-4">
                      <span className="metadata mb-1 block md:hidden">
                        Invitationsstatus
                      </span>
                      <StatusBadge tone="warning">
                        {invitationStatusLabels[invitation.status]}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <EmptyState compact title="Der er ingen afventende invitationer." />
        )}
      </PageSection>
    </div>
  );
}
