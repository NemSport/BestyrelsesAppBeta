"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, EmptyState, Input, Select, StatusBadge } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
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
  absent: "FravÃ¦rende",
  excused: "Afbud",
};

const statusTones: Record<ParticipantStatus, "success" | "neutral" | "warning"> =
  {
    attended: "success",
    absent: "neutral",
    excused: "warning",
  };

async function readResponse<T>(response: Response) {
  const result = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(result?.error || "Deltagerne kunne ikke gemmes.");
  }
  return result as T;
}

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
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const participantsByUser = new Map(
      internalParticipants.map((participant) => [
        participant.user_id,
        participant.attendance_status,
      ]),
    );
    setInternal(
      committeeMembers.map((member) => {
        const status = participantsByUser.get(member.user_id);
        return {
          userId: member.user_id,
          status: toParticipantStatus(status),
        };
      }),
    );
    setExternal(externalAttendees.map(toExternalState));
  }, [committeeMembers, externalAttendees, internalParticipants]);

  function updateInternal(userId: string, status: ParticipantStatus | "") {
    setInternal((current) =>
      current.map((participant) =>
        participant.userId === userId ? { ...participant, status } : participant,
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
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await readResponse<{ message: string }>(
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
            externalAttendees: external
              .map((attendee) => ({
                id: attendee.id,
                name: attendee.name,
                email: attendee.email,
                mobile: attendee.mobile,
                roleNote: attendee.roleNote,
              }))
              .filter((attendee) => attendee.name.trim()),
          }),
        }),
      );
      setMessage(result.message);
      router.refresh();
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Deltagerne kunne ikke gemmes.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" type="button" variant="ghost">
        {"\u00c5bn"}
      </Button>
      <Modal
        description="Registrer interne deltagere og eksterne nøglepersoner for mødet."
        footer={
          <div className="flex flex-wrap items-center gap-3">
            {canEdit ? (
              <Button disabled={saving} onClick={save} type="button">
                {saving ? "Gemmer..." : "Gem deltagere"}
              </Button>
            ) : null}
            <Button onClick={() => setOpen(false)} type="button" variant="secondary">
              Luk
            </Button>
            {message ? (
              <p className="text-sm font-medium text-emerald-700">{message}</p>
            ) : null}
            {error ? (
              <p className="text-sm font-medium text-red-700" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        }
        maxWidth="6xl"
        onClose={() => setOpen(false)}
        open={open}
        title="Deltagere"
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <section className="min-w-0">
            <div className="mb-2 flex items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Interne deltagere</h3>
                <p className="mt-0.5 text-xs text-muted">
                  Godkendelse sendes som standard til interne deltagere markeret
                  som til stede.
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
                        <option value="absent">FravÃ¦rende</option>
                        <option value="excused">Afbud</option>
                      </Select>
                    ) : status ? (
                      <StatusBadge tone={statusTones[status]}>
                        {statusLabels[status]}
                      </StatusBadge>
                    ) : (
                      <span className="text-xs text-muted">Ikke registreret</span>
                    )}
                  </div>
                );
              })}
              {committeeMembers.length === 0 ? (
                <EmptyState compact title="Ingen medlemmer i udvalget." />
              ) : null}
            </div>
          </section>

          <section className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Eksterne deltagere</h3>
                <p className="mt-0.5 text-xs text-muted">
                  Eksterne deltagere registreres pÃ¥ mÃ¸det, men modtager ikke
                  referatgodkendelse automatisk.
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
                  TilfÃ¸j ekstern
                </Button>
              ) : null}
            </div>
            <div className="space-y-3">
              {external.map((attendee, index) => (
                <div
                  className="rounded-[var(--radius-control)] border border-line bg-subtle/25 p-3"
                  key={attendee.id ?? `new-${index}`}
                >
                  {canEdit ? (
                    <div className="grid gap-2">
                      <Input
                        onChange={(event) =>
                          updateExternal(index, { name: event.target.value })
                        }
                        placeholder="Navn"
                        value={attendee.name}
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          onChange={(event) =>
                            updateExternal(index, { email: event.target.value })
                          }
                          placeholder="E-mail"
                          type="email"
                          value={attendee.email}
                        />
                        <Input
                          onChange={(event) =>
                            updateExternal(index, { mobile: event.target.value })
                          }
                          placeholder="Mobil"
                          value={attendee.mobile}
                        />
                      </div>
                      <Input
                        onChange={(event) =>
                          updateExternal(index, { roleNote: event.target.value })
                        }
                        placeholder="Funktion/notat"
                        value={attendee.roleNote}
                      />
                      <Button
                        onClick={() =>
                          setExternal((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
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
                          .join(" Â· ") || "Ingen kontaktoplysninger"}
                      </p>
                    </div>
                  )}
                </div>
              ))}
              {external.length === 0 ? (
                <EmptyState compact title="Ingen eksterne deltagere." />
              ) : null}
            </div>
          </section>

        </div>
      </Modal>
    </>
  );
}
