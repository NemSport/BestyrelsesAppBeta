"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { committeeRoleLabels, organizationRoleLabels } from "@/lib/localization";
import type { Database } from "@/types/database";
import type { Committee } from "@/types/domain";

type OrganizationRole = Exclude<
  Database["public"]["Enums"]["organization_role"],
  "owner"
>;
type CommitteeRole = Database["public"]["Enums"]["committee_role"];
type CommitteeAssignment = {
  committeeId: string;
  role: CommitteeRole;
};

export function ManualMemberForm({
  organizationId,
  committees,
}: {
  organizationId: string;
  committees: Committee[];
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [role, setRole] = useState<OrganizationRole>("member");
  const [committeeToAdd, setCommitteeToAdd] = useState("");
  const [committeeAssignments, setCommitteeAssignments] = useState<
    CommitteeAssignment[]
  >([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    setFieldErrors({});

    const response = await fetch(
      `/api/organizations/${organizationId}/members/manual`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          temporaryPassword,
          role,
          committeeAssignments,
        }),
      },
    );
    const result = (await response.json()) as {
      error?: string;
      message?: string;
      fieldErrors?: Record<string, string[]>;
    };
    setLoading(false);

    if (!response.ok) {
      setFieldErrors(
        Object.fromEntries(
          Object.entries(result.fieldErrors || {})
            .filter(([, messages]) => messages.length > 0)
            .map(([name, messages]) => [name, messages[0]]),
        ),
      );
      setError(result.error || "Medlemmet kunne ikke oprettes.");
      return;
    }

    setFullName("");
    setEmail("");
    setTemporaryPassword("");
    setRole("member");
    setCommitteeToAdd("");
    setCommitteeAssignments([]);
    setMessage(result.message || "Medlemmet er oprettet.");
    router.refresh();
  }

  const inputProps = (name: string) => ({
    "aria-describedby": fieldErrors[name] ? `${name}-error` : undefined,
    "aria-invalid": Boolean(fieldErrors[name]),
  });

  const selectedCommitteeIds = new Set(
    committeeAssignments.map((assignment) => assignment.committeeId),
  );
  const availableCommittees = committees.filter(
    (committee) => !selectedCommitteeIds.has(committee.id),
  );

  function addCommittee(committeeId: string) {
    if (!committeeId || selectedCommitteeIds.has(committeeId)) return;
    setCommitteeAssignments((assignments) => [
      ...assignments,
      { committeeId, role: "member" },
    ]);
    setCommitteeToAdd("");
  }

  function updateCommitteeRole(
    committeeId: string,
    committeeRole: CommitteeRole,
  ) {
    setCommitteeAssignments((assignments) =>
      assignments.map((assignment) =>
        assignment.committeeId === committeeId
          ? { ...assignment, role: committeeRole }
          : assignment,
      ),
    );
  }

  function removeCommittee(committeeId: string) {
    setCommitteeAssignments((assignments) =>
      assignments.filter(
        (assignment) => assignment.committeeId !== committeeId,
      ),
    );
  }

  return (
    <details className="panel p-6">
      <summary className="cursor-pointer text-lg font-bold">
        Opret medlem manuelt
      </summary>
      <p className="mt-3 text-sm text-slate-600">
        Brugeren oprettes med bekræftet e-mail og kan logge ind med den
        midlertidige adgangskode. Del adgangskoden via en sikker kanal.
      </p>

      <form className="mt-6 space-y-4" noValidate onSubmit={submit}>
        {message ? (
          <div
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
            role="status"
          >
            {message}
          </div>
        ) : null}
        {error ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            <p className="font-semibold">{error}</p>
            {Object.values(fieldErrors).length > 0 ? (
              <ul className="mt-2 list-disc pl-5">
                {[...new Set(Object.values(fieldErrors))].map((fieldError) => (
                  <li key={fieldError}>{fieldError}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="manual-full-name">
              Fulde navn
            </label>
            <input
              {...inputProps("fullName")}
              className="field"
              id="manual-full-name"
              onChange={(event) => setFullName(event.target.value)}
              value={fullName}
            />
            {fieldErrors.fullName ? (
              <p className="mt-1 text-sm text-red-700" id="fullName-error">
                {fieldErrors.fullName}
              </p>
            ) : null}
          </div>
          <div>
            <label className="label" htmlFor="manual-email">
              E-mail
            </label>
            <input
              {...inputProps("email")}
              className="field"
              id="manual-email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
            {fieldErrors.email ? (
              <p className="mt-1 text-sm text-red-700" id="email-error">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="manual-password">
              Midlertidig adgangskode
            </label>
            <input
              {...inputProps("temporaryPassword")}
              autoComplete="new-password"
              className="field"
              id="manual-password"
              onChange={(event) => setTemporaryPassword(event.target.value)}
              type="password"
              value={temporaryPassword}
            />
            {fieldErrors.temporaryPassword ? (
              <p
                className="mt-1 text-sm text-red-700"
                id="temporaryPassword-error"
              >
                {fieldErrors.temporaryPassword}
              </p>
            ) : null}
          </div>
          <div>
            <label className="label" htmlFor="manual-role">
              Organisationsrolle
            </label>
            <select
              {...inputProps("role")}
              className="field"
              id="manual-role"
              onChange={(event) =>
                setRole(event.target.value as OrganizationRole)
              }
              value={role}
            >
              {(["admin", "member", "viewer"] as OrganizationRole[]).map(
                (option) => (
                  <option key={option} value={option}>
                    {organizationRoleLabels[option]}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="manual-committee">
            Udvalg
          </label>
          <p className="mb-3 text-sm text-slate-600">
            Vælg et eller flere udvalg, medlemmet skal tilknyttes.
          </p>
          <select
            {...inputProps("committeeAssignments")}
            className="field"
            disabled={availableCommittees.length === 0}
            id="manual-committee"
            onChange={(event) => addCommittee(event.target.value)}
            value={committeeToAdd}
          >
            <option value="">
              {availableCommittees.length > 0
                ? "Tilføj et udvalg"
                : "Alle udvalg er valgt"}
            </option>
            {availableCommittees.map((committee) => (
              <option key={committee.id} value={committee.id}>
                {committee.name}
              </option>
            ))}
          </select>
          {fieldErrors.committeeAssignments ? (
            <p
              className="mt-1 text-sm text-red-700"
              id="committeeAssignments-error"
            >
              {fieldErrors.committeeAssignments}
            </p>
          ) : null}

          <div className="mt-3 space-y-2">
            {committeeAssignments.map((assignment) => {
              const committee = committees.find(
                (candidate) => candidate.id === assignment.committeeId,
              );
              if (!committee) return null;

              return (
                <div
                  className="grid gap-3 rounded-xl border border-line bg-slate-50 p-3 sm:grid-cols-[1fr_200px_auto] sm:items-center"
                  key={assignment.committeeId}
                >
                  <div>
                    <p className="font-semibold">{committee.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Valgt udvalg
                    </p>
                  </div>
                  <div>
                    <label
                      className="sr-only"
                      htmlFor={`committee-role-${committee.id}`}
                    >
                      Rolle i {committee.name}
                    </label>
                    <select
                      className="field"
                      id={`committee-role-${committee.id}`}
                      onChange={(event) =>
                        updateCommitteeRole(
                          committee.id,
                          event.target.value as CommitteeRole,
                        )
                      }
                      value={assignment.role}
                    >
                      {(
                        [
                          "chair",
                          "secretary",
                          "member",
                          "viewer",
                        ] as CommitteeRole[]
                      ).map((option) => (
                        <option key={option} value={option}>
                          {committeeRoleLabels[option]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                    onClick={() => removeCommittee(committee.id)}
                    type="button"
                  >
                    Fjern
                  </button>
                </div>
              );
            })}
            {committeeAssignments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-slate-500">
                Ingen udvalg valgt. Medlemmet oprettes kun i organisationen.
              </div>
            ) : null}
          </div>
        </div>

        <button className="button-primary" disabled={loading} type="submit">
          {loading ? "Opretter..." : "Opret medlem"}
        </button>
      </form>
    </details>
  );
}
