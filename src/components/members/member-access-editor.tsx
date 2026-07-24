"use client";

import { useMemo, useState } from "react";

import { Button, Modal, MutationFeedback, Select } from "@/components/ui";
import {
  focusInvalidField,
  useMutationFeedback,
  useUnsavedChanges,
} from "@/hooks/use-mutation-feedback";
import {
  isCommitteeRoleReduction,
  isOrganizationRoleReduction,
  type OrganizationRole,
} from "@/lib/member-access-capabilities";
import {
  committeeRoleLabels,
  organizationRoleLabels,
} from "@/lib/localization";
import {
  firstFieldError,
  MutationRequestError,
  readMutationResponse,
} from "@/lib/mutation-feedback";
import type { Database } from "@/types/database";
import type {
  Committee,
  OrganizationMemberDirectoryEntry,
} from "@/types/domain";

type CommitteeRole = Database["public"]["Enums"]["committee_role"];
type CommitteeAssignment = {
  committeeId: string;
  role: CommitteeRole;
};

const committeeRoles: CommitteeRole[] = [
  "chair",
  "secretary",
  "member",
  "viewer",
];

function normalizeAssignments(assignments: CommitteeAssignment[]) {
  return [...assignments].sort((a, b) =>
    a.committeeId.localeCompare(b.committeeId),
  );
}

export function MemberAccessEditor({
  organizationId,
  member,
  committees,
  roleOptions,
  onUpdated,
}: {
  organizationId: string;
  member: OrganizationMemberDirectoryEntry;
  committees: Committee[];
  roleOptions: OrganizationRole[];
  onUpdated: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<OrganizationRole>(member.role);
  const [assignments, setAssignments] = useState<CommitteeAssignment[]>([]);
  const [committeeToAdd, setCommitteeToAdd] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const mutation = useMutationFeedback();
  const loading = mutation.pending;

  const initialAssignments = useMemo(
    () =>
      normalizeAssignments(
        member.committees.map((committee) => ({
          committeeId: committee.id,
          role: committee.role,
        })),
      ),
    [member.committees],
  );
  const normalizedAssignments = normalizeAssignments(assignments);
  const dirty =
    role !== member.role ||
    JSON.stringify(normalizedAssignments) !==
      JSON.stringify(initialAssignments);
  const confirmDiscard = useUnsavedChanges(open && dirty && !loading);
  const selectedCommitteeIds = new Set(
    assignments.map((assignment) => assignment.committeeId),
  );
  const availableCommittees = committees.filter(
    (committee) => !selectedCommitteeIds.has(committee.id),
  );

  function showEditor() {
    setRole(member.role);
    setAssignments(initialAssignments);
    setCommitteeToAdd("");
    setFieldErrors({});
    mutation.reset();
    setOpen(true);
  }

  function closeEditor() {
    if (loading) return;
    if (!confirmDiscard()) return;
    setOpen(false);
    window.setTimeout(
      () =>
        document
          .getElementById(`member-access-trigger-${member.user_id}`)
          ?.focus(),
      0,
    );
  }

  function addCommittee(committeeId: string) {
    if (!committeeId || selectedCommitteeIds.has(committeeId)) return;
    setAssignments((current) => [...current, { committeeId, role: "member" }]);
    setCommitteeToAdd("");
    setFieldErrors({});
  }

  function updateCommitteeRole(committeeId: string, nextRole: CommitteeRole) {
    setAssignments((current) =>
      current.map((assignment) =>
        assignment.committeeId === committeeId
          ? { ...assignment, role: nextRole }
          : assignment,
      ),
    );
  }

  function removeCommittee(committeeId: string) {
    setAssignments((current) =>
      current.filter((assignment) => assignment.committeeId !== committeeId),
    );
  }

  function accessReductionSummary() {
    const consequences: string[] = [];
    if (isOrganizationRoleReduction(member.role, role)) {
      consequences.push(
        `Organisationsrollen ændres fra ${organizationRoleLabels[member.role]} til ${organizationRoleLabels[role]}.`,
      );
    }

    for (const previous of initialAssignments) {
      const next = assignments.find(
        (assignment) => assignment.committeeId === previous.committeeId,
      );
      const committeeName =
        committees.find((committee) => committee.id === previous.committeeId)
          ?.name || "Et udvalg";
      if (!next) {
        consequences.push(`${committeeName} fjernes fra medlemmet.`);
      } else if (isCommitteeRoleReduction(previous.role, next.role)) {
        consequences.push(
          `${committeeName}: rollen ændres fra ${committeeRoleLabels[previous.role]} til ${committeeRoleLabels[next.role]}.`,
        );
      }
    }
    return consequences;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || loading) return;

    const reductions = accessReductionSummary();
    if (
      reductions.length > 0 &&
      !window.confirm(
        `Denne ændring reducerer medlemmets adgang:\n\n${reductions.join(
          "\n",
        )}\n\nVil du gemme ændringen?`,
      )
    ) {
      return;
    }

    if (!mutation.begin("Medlemsadgangen gemmes...")) return;
    setFieldErrors({});
    try {
      const result = await readMutationResponse<{ message?: string }>(
        await fetch(
          `/api/organizations/${organizationId}/members/${member.user_id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role,
              committeeAssignments: normalizedAssignments,
            }),
          },
        ),
        "Adgangen kunne ikke opdateres. Kontrollér felterne, og prøv igen.",
      );

      mutation.succeed(result.message || "Medlemmets adgang er opdateret.");
      setOpen(false);
      onUpdated(result.message || "Medlemmets adgang er opdateret.");
      window.setTimeout(
        () =>
          document
            .getElementById(`member-access-trigger-${member.user_id}`)
            ?.focus(),
        0,
      );
    } catch (caughtError) {
      const nextFieldErrors =
        caughtError instanceof MutationRequestError
          ? caughtError.fieldErrors
          : {};
      setFieldErrors(nextFieldErrors);
      mutation.fail(
        caughtError instanceof Error
          ? caughtError.message
          : "Adgangen kunne ikke opdateres. Prøv igen.",
      );
      const field = firstFieldError(nextFieldErrors, [
        "role",
        "committeeAssignments",
      ]);
      focusInvalidField(
        field === "role"
          ? `organization-role-${member.user_id}`
          : field
            ? `committee-add-${member.user_id}`
            : null,
      );
    }
  }

  return (
    <>
      <Button
        onClick={showEditor}
        id={`member-access-trigger-${member.user_id}`}
        size="sm"
        variant="secondary"
      >
        Rediger adgang
      </Button>
      <Modal
        description={`Administrér organisationsrolle og udvalg for ${
          member.full_name || member.email
        }.`}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              disabled={loading}
              onClick={closeEditor}
              variant="secondary"
            >
              Annuller
            </Button>
            <Button
              disabled={!dirty || loading}
              form={`member-access-${member.user_id}`}
              type="submit"
            >
              {loading ? "Gemmer..." : "Gem ændringer"}
            </Button>
          </div>
        }
        onClose={closeEditor}
        open={open}
        title="Rediger medlemsadgang"
      >
        <form
          className="space-y-6"
          id={`member-access-${member.user_id}`}
          onSubmit={save}
        >
          <MutationFeedback feedback={mutation.feedback} />

          <div>
            <label
              className="label"
              htmlFor={`organization-role-${member.user_id}`}
            >
              Organisationsrolle
            </label>
            <Select
              aria-describedby={
                fieldErrors.role
                  ? `organization-role-error-${member.user_id}`
                  : undefined
              }
              aria-invalid={Boolean(fieldErrors.role)}
              id={`organization-role-${member.user_id}`}
              onChange={(event) =>
                setRole(event.target.value as OrganizationRole)
              }
              value={role}
            >
              {roleOptions.map((option) => (
                <option key={option} value={option}>
                  {organizationRoleLabels[option]}
                </option>
              ))}
            </Select>
            <p className="mt-2 text-sm text-muted">
              Organisationsrollen gælder på tværs af alle udvalg.
            </p>
            {member.role === "owner" &&
            roleOptions.length === 1 &&
            roleOptions[0] === "owner" ? (
              <p className="mt-2 text-sm text-muted">
                Rollen kan ikke ændres, fordi organisationen skal have mindst én
                aktiv ejer.
              </p>
            ) : null}
            {fieldErrors.role ? (
              <p
                className="mt-1 text-sm text-danger"
                id={`organization-role-error-${member.user_id}`}
              >
                {fieldErrors.role}
              </p>
            ) : null}
          </div>

          <div>
            <label
              className="label"
              htmlFor={`committee-add-${member.user_id}`}
            >
              Udvalgstilknytninger
            </label>
            <p className="mb-3 text-sm text-muted">
              Tilføj udvalg og vælg medlemmets rolle i hvert udvalg.
            </p>
            <Select
              disabled={availableCommittees.length === 0}
              id={`committee-add-${member.user_id}`}
              onChange={(event) => addCommittee(event.target.value)}
              value={committeeToAdd}
            >
              <option value="">
                {availableCommittees.length > 0
                  ? "Vælg udvalg"
                  : "Alle udvalg er valgt"}
              </option>
              {availableCommittees.map((committee) => (
                <option key={committee.id} value={committee.id}>
                  {committee.name}
                </option>
              ))}
            </Select>
            {fieldErrors.committeeAssignments ? (
              <p className="mt-1 text-sm text-danger" role="alert">
                {fieldErrors.committeeAssignments}
              </p>
            ) : null}

            <div className="mt-4 space-y-3">
              {assignments.map((assignment) => {
                const committee = committees.find(
                  (candidate) => candidate.id === assignment.committeeId,
                );
                if (!committee) return null;
                return (
                  <div
                    className="grid gap-3 border border-line bg-subtle/40 p-3 sm:grid-cols-[1fr_190px_auto] sm:items-center"
                    key={assignment.committeeId}
                  >
                    <p className="font-semibold">{committee.name}</p>
                    <Select
                      aria-label={`Udvalgsrolle i ${committee.name}`}
                      onChange={(event) =>
                        updateCommitteeRole(
                          assignment.committeeId,
                          event.target.value as CommitteeRole,
                        )
                      }
                      value={assignment.role}
                    >
                      {committeeRoles.map((committeeRole) => (
                        <option key={committeeRole} value={committeeRole}>
                          {committeeRoleLabels[committeeRole]}
                        </option>
                      ))}
                    </Select>
                    <Button
                      onClick={() => removeCommittee(assignment.committeeId)}
                      size="sm"
                      variant="danger"
                    >
                      Fjern
                    </Button>
                  </div>
                );
              })}
              {assignments.length === 0 ? (
                <div className="border border-dashed border-line px-4 py-3 text-sm text-muted">
                  Medlemmet har ingen udvalgstilknytninger.
                </div>
              ) : null}
            </div>
          </div>

          {!dirty ? (
            <p className="text-sm text-muted" role="status">
              Der er ingen ændringer at gemme.
            </p>
          ) : (
            <p className="text-sm text-warning" role="status">
              Du har ændringer, som ikke er gemt.
            </p>
          )}
        </form>
      </Modal>
    </>
  );
}
