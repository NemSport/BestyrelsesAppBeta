"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  EmptyState,
  FieldError,
  Input,
  MutationFeedback,
  Select,
  StatusBadge,
} from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import {
  focusInvalidField,
  useMutationFeedback,
  useUnsavedChanges,
} from "@/hooks/use-mutation-feedback";
import {
  hasExternalAttendeeInput,
  remapExternalAttendeeFieldErrors,
} from "@/lib/meeting-participants";
import {
  firstFieldError,
  MutationRequestError,
  readMutationResponse,
} from "@/lib/mutation-feedback";
import type { Database } from "@/types/database";
import type {
  MeetingAttendee,
  MeetingExternalAttendee,
  OrganizationMemberDirectoryEntry,
} from "@/types/domain";

type ParticipantStatus = Extract<
  Database["public"]["Enums"]["attendance_status"],
  "attended" | "absent" | "excused"
>;

type InternalParticipantState = {
  userId: string;
  status: ParticipantStatus | "";
};

type ExternalAttendeeState = {
  id?: string;
  name: string;
  email: string;
  mobile: string;
  roleNote: string;
};

const statusLabels: Record<ParticipantStatus, string> = {
  attended: "Til stede",
  absent: "Fraværende",
  excused: "Afbud",
};

const statusTones: Record<
  ParticipantStatus,
  "success" | "neutral" | "warning"
> = {
  attended: "success",
  absent: "neutral",
  excused: "warning",
};

function toExternalState(
  attendee: MeetingExternalAttendee,
): ExternalAttendeeState {
  return {
    id: attendee.id,
    name: attendee.name,
    email: attendee.email ?? "",
    mobile: attendee.mobile ?? "",
    roleNote: attendee.role_note ?? "",
  };
}

function toParticipantStatus(
  status: Database["public"]["Enums"]["attendance_status"] | undefined,
): ParticipantStatus | "" {
  if (status === "accepted" || status === "attended") return "attended";
  if (status === "absent" || status === "excused") return status;
  return "";
}

export function MeetingParticipantsPanel({
  organizationId,
  committeeId,
  meetingId,
  members,
  internalParticipants,
  externalAttendees,
  canEdit,
}: {
  organizationId: string;
  committeeId: string;
  meetingId: string;
  members: OrganizationMemberDirectoryEntry[];
  internalParticipants: MeetingAttendee[];
  externalAttendees: MeetingExternalAttendee[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const committeeMembers = useMemo(
    () =>
      members
        .filter(
          (member) =>
            member.status === "active" &&
            member.committees.some((committee) => committee.id === committeeId),
        )
        .sort((left, right) =>
          (left.full_name || left.email).localeCompare(
            right.full_name || right.email,
            "da",
          ),
        ),
    [committeeId, members],
  );
  const [internal, setInternal] = useState<InternalParticipantState[]>([]);
  const [external, setExternal] = useState<ExternalAttendeeState[]>([]);
  const [savedSignature, setSavedSignature] = useState("");
  const [open, setOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const mutation = useMutationFeedback();
  const currentSignature = JSON.stringify({ internal, external });
  const dirty = Boolean(savedSignature) && currentSignature !== savedSignature;
  const confirmDiscard = useUnsavedChanges(open && dirty && !mutation.pending);

  useEffect(() => {
    const participantsByUser = new Map(
      internalParticipants.map((participant) => [
        participant.user_id,
        participant.attendance_status,
      ]),
    );
    const nextInternal = committeeMembers.map((member) => {
      const status = participantsByUser.get(member.user_id);
      return {
        userId: member.user_id,
        status: toParticipantStatus(status),
      };
    });
    const nextExternal = externalAttendees.map(toExternalState);
    setInternal(nextInternal);
    setExternal(nextExternal);
    setSavedSignature(
      JSON.stringify({ internal: nextInternal, external: nextExternal }),
    );
  }, [committeeMembers, externalAttendees, internalParticipants]);

  function updateInternal(userId: string, status: ParticipantStatus | "") {
    setInternal((current) =>
      current.map((participant) =>
        participant.userId === userId
          ? { ...participant, status }
          : participant,
      ),
    );
  }

  function updateExternal(
    index: number,
    patch: Partial<ExternalAttendeeState>,
  ) {
    setExternal((current) =>
      current.map((attendee, attendeeIndex) =>
        attendeeIndex === index ? { ...attendee, ...patch } : attendee,
      ),
    );
  }

  async function save() {
    if (!mutation.begin("Deltagerne gemmes...")) return;
    setFieldErrors({});
    const externalPayload = external.flatMap((attendee, originalIndex) =>
      hasExternalAttendeeInput(attendee)
        ? [
            {
              originalIndex,
              value: {
                id: attendee.id,
                name: attendee.name,
                email: attendee.email,
                mobile: attendee.mobile,
                roleNote: attendee.roleNote,
              },
            },
          ]
        : [],
    );
    try {
      const result = await readMutationResponse<{ message: string }>(
        await fetch(`/api/meetings/${meetingId}/participants`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            committeeId,
            internalParticipants: internal.flatMap((participant) =>
              participant.status
                ? [
                    {
                      userId: participant.userId,
                      status: participant.status,
                    },
                  ]
                : [],
            ),
            externalAttendees: externalPayload.map((item) => item.value),
          }),
        }),
        "Deltagerne kunne ikke gemmes. Kontrollér felterne, og prøv igen.",
      );
      setSavedSignature(currentSignature);
      mutation.succeed(result.message || "Deltagerne er gemt.");
      router.refresh();
    } catch (caught) {
      const nextFieldErrors =
        caught instanceof MutationRequestError
          ? remapExternalAttendeeFieldErrors(
              caught.fieldErrors,
              externalPayload.map((item) => item.originalIndex),
            )
          : {};
      setFieldErrors(nextFieldErrors);
      mutation.fail(
        caught instanceof Error
          ? caught.message
          : "Deltagerne kunne ikke gemmes. Prøv igen.",
      );
      const firstError = firstFieldError(nextFieldErrors, [
        ...external.flatMap((_, index) => [
          `externalAttendees.${index}.name`,
          `externalAttendees.${index}.email`,
          `externalAttendees.${index}.mobile`,
          `externalAttendees.${index}.roleNote`,
        ]),
      ]);
      focusInvalidField(
        firstError
          ? `external-attendee-${firstError.replaceAll(".", "-")}`
          : null,
      );
    }
  }

  function closeModal() {
    if (mutation.pending || !confirmDiscard()) return;
    setOpen(false);
    setFieldErrors({});
    mutation.reset();
  }

  function openModal() {
    setFieldErrors({});
    mutation.reset();
    setOpen(true);
  }

  return (
    <>
      <Button onClick={openModal} size="sm" type="button" variant="ghost">
        {"\u00c5bn"}
      </Button>
      <Modal
        description={
          canEdit
            ? "Registrer interne deltagere og eksterne nøglepersoner for mødet."
            : "Se de registrerede deltagere. Deltagerlisten er skrivebeskyttet for dig."
        }
        footer={
          <div className="flex flex-wrap items-center gap-3">
            {canEdit ? (
              <Button
                disabled={mutation.pending || !dirty}
                onClick={save}
                type="button"
              >
                {mutation.pending ? "Gemmer..." : "Gem deltagere"}
              </Button>
            ) : null}
            <Button
              disabled={mutation.pending}
              onClick={closeModal}
              type="button"
              variant="secondary"
            >
              Luk
            </Button>
            <MutationFeedback feedback={mutation.feedback} />
            {canEdit && dirty && mutation.feedback.status === "idle" ? (
              <p className="text-sm text-warning" role="status">
                Du har ændringer, som ikke er gemt.
              </p>
            ) : null}
          </div>
        }
        maxWidth="6xl"
        onClose={closeModal}
        open={open}
        title="Deltagere"
      >
        {!canEdit ? (
          <div
            className="mb-4 rounded-[var(--radius-control)] border border-line bg-subtle/45 px-3 py-2 text-sm text-muted"
            role="status"
          >
            <p className="font-semibold text-ink">Skrivebeskyttet</p>
            <p>
              Du kan se deltagerstatus. En mødeansvarlig kan opdatere
              deltagerlisten.
            </p>
          </div>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <section className="min-w-0">
            <div className="mb-2 flex items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Interne deltagere</h3>
                <p className="mt-0.5 text-xs text-muted">
                  {canEdit
                    ? "Godkendelse sendes som standard til interne deltagere markeret som til stede."
                    : "Her vises den registrerede deltagelse for interne medlemmer."}
                </p>
              </div>
            </div>
            <div className="divide-y divide-line border-y border-line">
              {committeeMembers.map((member) => {
                const participant = internal.find(
                  (item) => item.userId === member.user_id,
                );
                const status = participant?.status ?? "";
                return (
                  <div
                    className="grid gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_170px] sm:items-center"
                    key={member.user_id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {member.full_name || member.email}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {member.email}
                      </p>
                    </div>
                    {canEdit ? (
                      <Select
                        aria-label={`Deltagerstatus for ${
                          member.full_name || member.email
                        }`}
                        onChange={(event) =>
                          updateInternal(
                            member.user_id,
                            event.target.value as ParticipantStatus | "",
                          )
                        }
                        value={status}
                      >
                        <option value="">Ikke registreret</option>
                        <option value="attended">Til stede</option>
                        <option value="absent">Fraværende</option>
                        <option value="excused">Afbud</option>
                      </Select>
                    ) : status ? (
                      <StatusBadge tone={statusTones[status]}>
                        {statusLabels[status]}
                      </StatusBadge>
                    ) : (
                      <span className="text-xs text-muted">
                        Ikke registreret
                      </span>
                    )}
                  </div>
                );
              })}
              {committeeMembers.length === 0 ? (
                <EmptyState
                  compact
                  description={
                    canEdit
                      ? "Tilføj medlemmer til udvalget, før intern deltagelse kan registreres."
                      : "En organisationsadministrator kan tilføje medlemmer til udvalget."
                  }
                  kind={canEdit ? "empty" : "read-only"}
                  title="Ingen medlemmer i udvalget."
                />
              ) : null}
            </div>
          </section>

          <section className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Eksterne deltagere</h3>
                <p className="mt-0.5 text-xs text-muted">
                  {canEdit
                    ? "Eksterne deltagere registreres på mødet, men modtager ikke referatgodkendelse automatisk."
                    : "Her vises de eksterne deltagere, der er registreret på mødet."}
                </p>
              </div>
              {canEdit ? (
                <Button
                  onClick={() =>
                    setExternal((current) => [
                      ...current,
                      { name: "", email: "", mobile: "", roleNote: "" },
                    ])
                  }
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Tilføj ekstern
                </Button>
              ) : null}
            </div>
            <div className="space-y-3">
              {external.map((attendee, index) => {
                const fieldKey = (field: keyof ExternalAttendeeState) =>
                  `externalAttendees.${index}.${field}`;
                const fieldId = (field: keyof ExternalAttendeeState) =>
                  `external-attendee-${fieldKey(field).replaceAll(".", "-")}`;
                return (
                  <div
                    className="rounded-[var(--radius-control)] border border-line bg-subtle/25 p-3"
                    key={attendee.id ?? `new-${index}`}
                  >
                    {canEdit ? (
                      <div className="grid gap-2">
                        <label className="label" htmlFor={fieldId("name")}>
                          Navn
                        </label>
                        <Input
                          aria-describedby={
                            fieldErrors[fieldKey("name")]
                              ? `${fieldId("name")}-error`
                              : undefined
                          }
                          aria-invalid={Boolean(fieldErrors[fieldKey("name")])}
                          id={fieldId("name")}
                          onChange={(event) =>
                            updateExternal(index, { name: event.target.value })
                          }
                          placeholder="Navn"
                          value={attendee.name}
                        />
                        <FieldError
                          id={`${fieldId("name")}-error`}
                          message={fieldErrors[fieldKey("name")]}
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="label" htmlFor={fieldId("email")}>
                              E-mail
                            </label>
                            <Input
                              aria-describedby={
                                fieldErrors[fieldKey("email")]
                                  ? `${fieldId("email")}-error`
                                  : undefined
                              }
                              aria-invalid={Boolean(
                                fieldErrors[fieldKey("email")],
                              )}
                              id={fieldId("email")}
                              onChange={(event) =>
                                updateExternal(index, {
                                  email: event.target.value,
                                })
                              }
                              placeholder="E-mail"
                              type="email"
                              value={attendee.email}
                            />
                            <FieldError
                              id={`${fieldId("email")}-error`}
                              message={fieldErrors[fieldKey("email")]}
                            />
                          </div>
                          <div>
                            <label
                              className="label"
                              htmlFor={fieldId("mobile")}
                            >
                              Mobil
                            </label>
                            <Input
                              aria-describedby={
                                fieldErrors[fieldKey("mobile")]
                                  ? `${fieldId("mobile")}-error`
                                  : undefined
                              }
                              aria-invalid={Boolean(
                                fieldErrors[fieldKey("mobile")],
                              )}
                              id={fieldId("mobile")}
                              onChange={(event) =>
                                updateExternal(index, {
                                  mobile: event.target.value,
                                })
                              }
                              placeholder="Mobil"
                              value={attendee.mobile}
                            />
                            <FieldError
                              id={`${fieldId("mobile")}-error`}
                              message={fieldErrors[fieldKey("mobile")]}
                            />
                          </div>
                        </div>
                        <label className="label" htmlFor={fieldId("roleNote")}>
                          Funktion eller notat
                        </label>
                        <Input
                          aria-describedby={
                            fieldErrors[fieldKey("roleNote")]
                              ? `${fieldId("roleNote")}-error`
                              : undefined
                          }
                          aria-invalid={Boolean(
                            fieldErrors[fieldKey("roleNote")],
                          )}
                          id={fieldId("roleNote")}
                          onChange={(event) =>
                            updateExternal(index, {
                              roleNote: event.target.value,
                            })
                          }
                          placeholder="Funktion/notat"
                          value={attendee.roleNote}
                        />
                        <FieldError
                          id={`${fieldId("roleNote")}-error`}
                          message={fieldErrors[fieldKey("roleNote")]}
                        />
                        <Button
                          onClick={() =>
                            setExternal((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                          size="sm"
                          type="button"
                          variant="danger"
                        >
                          Fjern
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-semibold">{attendee.name}</p>
                        <p className="text-xs text-muted">
                          {[attendee.roleNote, attendee.email, attendee.mobile]
                            .filter(Boolean)
                            .join(" · ") || "Ingen kontaktoplysninger"}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
              {external.length === 0 ? (
                <EmptyState
                  compact
                  description={
                    canEdit
                      ? "Brug Tilføj ekstern deltager, hvis en gæst skal registreres."
                      : "Eksterne deltagere vises her, når en mødeansvarlig registrerer dem."
                  }
                  kind={canEdit ? "empty" : "read-only"}
                  title="Ingen eksterne deltagere."
                />
              ) : null}
            </div>
          </section>
        </div>
      </Modal>
    </>
  );
}
