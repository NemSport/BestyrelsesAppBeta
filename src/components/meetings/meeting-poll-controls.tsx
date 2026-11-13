"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { formatDateTime } from "@/lib/localization";

async function submitPoll(committeeId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/committees/${committeeId}/meeting-polls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Prøv igen.");
  return result;
}

export function CreateMeetingPoll({
  organizationId,
  committeeId,
  root,
  members,
}: {
  organizationId: string;
  committeeId: string;
  root: string;
  members: { id: string; name: string; email: string | null }[];
}) {
  const router = useRouter();
  const [options, setOptions] = useState(["", ""]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const selectable = members.filter(({ email }) => email).map(({ id }) => id);
  const allSelected =
    selectable.length > 0 &&
    selectable.every((id) => selectedMembers.includes(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dates = form
      .getAll("options")
      .map((value) => new Date(String(value)));
    if (
      dates.some(
        (value) =>
          !Number.isFinite(value.getTime()) || value.getTime() <= Date.now(),
      ) ||
      new Set(dates.map((date) => date.getTime())).size !== dates.length
    ) {
      setError("Vælg forskellige datoer og tidspunkter i fremtiden.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const { pollId } = await submitPoll(committeeId, {
        action: "create",
        organizationId,
        title: form.get("title"),
        options: dates.map((date) => date.toISOString()),
        memberIds: selectedMembers,
        emails: String(form.get("emails"))
          .split(/[\s,;]+/)
          .filter(Boolean),
      });
      router.push(`${root}/${pollId}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Datoafstemningen kunne ikke oprettes.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="panel max-w-2xl space-y-4 p-5">
      <label className="block text-sm font-medium">
        Mødets titel
        <Input
          className="mt-1"
          name="title"
          required
          minLength={2}
          maxLength={180}
        />
      </label>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold">
          Forslag til dato og klokkeslæt (din lokale tid)
        </legend>
        {options.map((value, index) => (
          <div className="flex flex-wrap items-end gap-2" key={index}>
            <label className="min-w-0 flex-1 text-sm">
              Tidspunkt {index + 1}
              <Input
                className="mt-1 w-full"
                type="datetime-local"
                name="options"
                required
                value={value}
                onChange={(event) =>
                  setOptions((items) =>
                    items.map((item, i) =>
                      i === index ? event.target.value : item,
                    ),
                  )
                }
              />
            </label>
            {options.length > 2 ? (
              <Button
                variant="secondary"
                type="button"
                onClick={() =>
                  setOptions((items) => items.filter((_, i) => i !== index))
                }
                aria-label={`Fjern tidspunkt ${index + 1}`}
              >
                Fjern
              </Button>
            ) : null}
          </div>
        ))}
        <Button
          variant="secondary"
          type="button"
          disabled={options.length >= 12}
          onClick={() => setOptions([...options, ""])}
        >
          Tilføj tidspunkt
        </Button>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">
          Medlemmer af udvalget
        </legend>
        {selectable.length ? (
          <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelectedMembers(allSelected ? [] : selectable)}
            />
            Vælg alle medlemmer med mailadresse
          </label>
        ) : null}
        {members.length ? (
          <div className="max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line px-3">
            {members.map(({ id, name, email }) => (
              <label
                key={id}
                className="flex min-h-10 items-center gap-2 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedMembers.includes(id)}
                  disabled={!email}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelectedMembers((current) =>
                      checked
                        ? [...current, id]
                        : current.filter((value) => value !== id),
                    );
                  }}
                />
                <span className="break-words">
                  {name}
                  {!email ? " · Mangler mailadresse" : ""}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Udvalget har ingen aktive medlemmer.
          </p>
        )}
      </fieldset>
      <label className="block text-sm font-medium">
        Eksterne deltagere
        <textarea
          name="emails"
          rows={3}
          className="mt-1 w-full rounded-lg border border-line bg-canvas p-3"
          placeholder="Én adresse pr. linje"
          aria-describedby="poll-email-help"
        />
      </label>
      <p id="poll-email-help" className="text-sm text-muted">
        Op til 50 deltagere. Hver deltager får sit eget link.
      </p>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Opretter …" : "Opret datoafstemning"}
      </Button>
    </form>
  );
}

export function ManageMeetingPoll({
  organizationId,
  committeeId,
  pollId,
  options,
  meetingsRoot,
}: {
  organizationId: string;
  committeeId: string;
  pollId: string;
  options: string[];
  meetingsRoot: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState(false);
  const upcoming = options
    .map((date, index) => ({ date, index }))
    .filter(({ date }) => Date.parse(date) > Date.now());
  async function run(action: "send" | "finalize") {
    setBusy(true);
    setFeedback("");
    setError(false);
    try {
      const result = await submitPoll(committeeId, {
        organizationId,
        pollId,
        action,
        optionIndex: Number(selected),
      });
      if (action === "finalize")
        router.push(`${meetingsRoot}/${result.meetingId}#meeting-invitation`);
      else {
        setError(result.sent !== result.total);
        setFeedback(
          `Sendt til ${result.sent} af ${result.total} deltagere. Du kan også dele de personlige links nedenfor.`,
        );
      }
    } catch (cause) {
      setError(true);
      setFeedback(cause instanceof Error ? cause.message : "Prøv igen.");
    } finally {
      setBusy(false);
    }
  }
  if (!upcoming.length)
    return (
      <p className="text-sm text-muted">
        Alle foreslåede tidspunkter er passeret.
      </p>
    );
  return (
    <div className="panel space-y-4 p-4">
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => void run("send")}
      >
        Send afstemning på mail
      </Button>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run("finalize");
        }}
      >
        <label className="text-sm font-medium">
          Mødets tidspunkt
          <select
            required
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="mt-1 block min-h-11 rounded-lg border border-line bg-canvas px-3"
          >
            <option value="">Vælg tidspunkt</option>
            {upcoming.map(({ date, index }) => (
              <option key={date} value={index + 1}>
                {formatDateTime(date)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={busy || !selected}>
          Fastlæg dato og opret møde
        </Button>
      </form>
      {feedback ? (
        <p
          className={error ? "text-sm text-danger" : "text-sm text-muted"}
          role={error ? "alert" : "status"}
        >
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
