"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ManualMemberForm } from "@/components/members/manual-member-form";
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
import type { Database } from "@/types/database";
import type {
  Committee,
  OrganizationInvitation,
  OrganizationMemberDirectoryEntry,
} from "@/types/domain";

type OrganizationRole = Database["public"]["Enums"]["organization_role"];

const allRoleOptions: OrganizationRole[] = ["owner", "admin", "member", "viewer"];
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
  const [invitationRole, setInvitationRole] = useState<OrganizationRole>("member");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  async function readResponse(response: Response) {
    const result = (await response.json()) as { error?: string; message?: string };
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
          body: JSON.stringify({ email: normalizedEmail, role: invitationRole }),
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

  async function updateRole(memberId: string, role: OrganizationRole) {
    setMessage(null);
    setError(null);
    setLoadingKey(`role-${memberId}`);
    try {
      const result = await readResponse(
        await fetch(`/api/organizations/${organizationId}/members/${memberId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }),
      );
      setMessage(result.message || "Medlemmets rolle er opdateret.");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Rollen kunne ikke opdateres.",
      );
      router.refresh();
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
        <div className="alert-success rounded-xl px-4 py-3 text-sm" role="status">
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
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Medlem</TableHeaderCell>
                  <TableHeaderCell>Udvalg</TableHeaderCell>
                  <TableHeaderCell>Rolle</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Handlinger</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {members.map((member) => {
                  const isSelf = member.user_id === currentUserId;
                  const actorIsOwner = currentUserRole === "owner";
                  const managesOwner = member.role === "owner";
                  const canChangeRole =
                    canManage && (actorIsOwner || (!isSelf && !managesOwner));
                  const canRemove =
                    canManage && (actorIsOwner || !managesOwner);
                  const roleOptions = actorIsOwner
                    ? allRoleOptions
                    : adminRoleOptions;

                  return (
                    <TableRow key={member.user_id}>
                      <TableCell className="min-w-56">
                        <p className="font-semibold">
                          {member.full_name || member.email}
                          {isSelf ? (
                            <span className="ml-2 text-xs font-normal text-muted">
                              Dig
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-sm text-muted">{member.email}</p>
                      </TableCell>
                      <TableCell className="min-w-64">
                        <div className="flex flex-wrap gap-1.5">
                          {member.committees.length > 0 ? (
                            member.committees.map((committee) => (
                              <StatusBadge
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
                      <TableCell className="min-w-44">
                        {canChangeRole ? (
                          <Select
                            aria-label={`Rolle for ${
                              member.full_name || member.email
                            }`}
                            defaultValue={member.role}
                            disabled={loadingKey === `role-${member.user_id}`}
                            onChange={(event) =>
                              updateRole(
                                member.user_id,
                                event.target.value as OrganizationRole,
                              )
                            }
                          >
                            {roleOptions.map((role) => (
                              <option key={role} value={role}>
                                {organizationRoleLabels[role]}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          organizationRoleLabels[member.role]
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone="success">
                          {membershipStatusLabels[member.status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        {canRemove ? (
                          <ActionMenu align="right">
                            <button
                              className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft"
                              disabled={loadingKey === `remove-${member.user_id}`}
                              onClick={() => removeMember(member)}
                              type="button"
                            >
                              {loadingKey === `remove-${member.user_id}`
                                ? "Fjerner..."
                                : "Fjern medlem"}
                            </button>
                          </ActionMenu>
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
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>E-mail</TableHeaderCell>
                  <TableHeaderCell>Rolle</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-semibold">
                      {invitation.email}
                    </TableCell>
                    <TableCell>
                      {organizationRoleLabels[invitation.role]}
                    </TableCell>
                    <TableCell>
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
