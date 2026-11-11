"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Answer = {
  answer: string;
  sources: { id: number; title: string; href: string }[];
};
const examples = [
  "Har vi tidligere talt om spillertøj? Henvis til relevante møder.",
  "Lav et udkast til dagsordenen for stormødet den 19.11.",
];

export function AdvisoryAi({ organizationId }: { organizationId: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setAnswer(null);
    setError("");
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/advisory`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        },
      );
      if (!response.ok) throw new Error();
      setAnswer((await response.json()) as Answer);
    } catch {
      setError("Advisory AI kunne ikke svare lige nu. Prøv igen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="advisory-title"
      className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 text-ink sm:p-5"
    >
      <h2 id="advisory-title" className="text-base font-semibold">
        Advisory AI
      </h2>
      <form className="mt-2 flex flex-wrap gap-2" onSubmit={submit}>
        <label className="sr-only" htmlFor="advisory-question">
          Spørg Advisory AI
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
      <div className="mt-2 flex flex-wrap gap-2">
        {examples.map((example, index) => (
          <button
            key={example}
            type="button"
            disabled={pending}
            className="min-h-11 rounded-lg border border-line-strong px-3 text-left text-xs text-brand hover:bg-brand-soft"
            onClick={() => setQuestion(example)}
          >
            {index === 0
              ? "Find tidligere snak om spillertøj"
              : "Lav udkast til stormødets dagsorden"}
          </button>
        ))}
      </div>
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
