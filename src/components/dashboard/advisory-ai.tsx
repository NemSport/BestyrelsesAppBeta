"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Answer = {
  answer: string;
  sources: { id: number; title: string; href: string }[];
};
export function AdvisoryAi({
  organizationId,
  summary = false,
}: {
  organizationId: string;
  summary?: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setPending(true);
    setAnswer(null);
    setError("");
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/advisory`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(summary ? { mode: "recent" } : { question }),
        },
      );
      if (!response.ok) throw new Error();
      setAnswer((await response.json()) as Answer);
    } catch {
      setError("Bestie kunne ikke svare lige nu. Prøv igen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-label={summary ? "Opsummering fra Bestie" : undefined}
      aria-labelledby={summary ? undefined : "advisory-title"}
      className={
        summary
          ? "my-2 text-ink"
          : "rounded-[var(--radius-panel)] border border-line bg-surface p-4 text-ink sm:p-5"
      }
    >
      {summary ? (
        <button
          type="button"
          className="min-h-11 rounded-lg bg-brand-soft px-3 text-sm font-semibold text-brand disabled:opacity-60"
          disabled={pending}
          onClick={() => void submit()}
        >
          {pending ? "Bestie læser referaterne …" : "Lad Bestie opsummere"}
        </button>
      ) : (
        <>
          <h1 id="advisory-title" className="text-base font-semibold">
            Bestie
          </h1>
          <form className="mt-2 flex flex-wrap gap-2" onSubmit={submit}>
            <label className="sr-only" htmlFor="advisory-question">
              Spørg Bestie
            </label>
            <input
              className="min-h-11 min-w-0 flex-[1_1_15rem] rounded-lg border border-line-strong bg-canvas px-3 text-sm text-ink placeholder:text-muted"
              id="advisory-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Spørg om tidligere møder, eller bed om et udkast …"
              required
              minLength={5}
              maxLength={1000}
              disabled={pending}
            />
            <button
              className="min-h-11 rounded-lg bg-brand px-4 text-sm font-bold text-white disabled:opacity-60"
              disabled={pending}
            >
              {pending ? "Søger …" : "Spørg →"}
            </button>
          </form>
        </>
      )}
      <div aria-live="polite">
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {answer && (
          <div className="mt-4 border-t border-line-strong pt-3">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {answer.answer}
            </p>
            {answer.sources.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-brand">
                {answer.sources.map((source) => (
                  <li key={source.id}>
                    <Link className="underline" href={source.href}>
                      [{source.id}] {source.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
