"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { BestiePushToggle } from "@/components/bestie/bestie-push-toggle";
import { Button, EmptyState, StatusBadge } from "@/components/ui";
import { bestieDate, bestiePath, type BestieThread } from "@/lib/bestie";

export function BestieInbox({
  initialThreads,
  organizationId,
  selected,
}: {
  initialThreads: BestieThread[];
  organizationId: string;
  selected: string | null;
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const retry = useRef<{
    replyId: string;
    message: string;
    version: string;
  } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const endpoint = `/api/organizations/${organizationId}/bestie`;
  const current = threads.find((thread) => thread.id === selected);
  const count = current?.messages.length;

  useEffect(() => {
    let active = true;
    let request: AbortController | null = null;
    async function refresh() {
      if (document.hidden || request) return;
      request = new AbortController();
      try {
        const url = selected ? `${endpoint}?samtale=${selected}` : endpoint;
        const response = await fetch(url, {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) return;
        const result = (await response.json()) as { threads: BestieThread[] };
        if (active)
          setThreads((previous) => {
            const byId = new Map(previous.map((thread) => [thread.id, thread]));
            return result.threads.map((thread) => {
              const local = byId.get(thread.id);
              return local &&
                (Date.parse(local.version) > Date.parse(thread.version) ||
                  (local.version === thread.version && !local.unread))
                ? local
                : thread;
            });
          });
      } catch {
        // Keep the last available conversations on a temporary network error.
      } finally {
        request = null;
      }
    }
    const timer = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      request?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [endpoint, selected]);

  useEffect(() => {
    if (!selected || count === undefined) return;
    end.current?.scrollIntoView({ block: "nearest" });
    let active = true;
    void fetch(`${endpoint}/${selected}`, { method: "PATCH" })
      .then((response) => {
        if (response.ok && active)
          setThreads((previous) =>
            previous.map((thread) =>
              thread.id === selected ? { ...thread, unread: false } : thread,
            ),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [endpoint, selected, count]);

  useEffect(() => {
    if (selected) input.current?.focus({ preventScroll: true });
  }, [selected]);

  async function reply(body: string) {
    if (!current || busy || !body.trim()) return;
    const text = body.trim();
    const payload =
      retry.current?.message === text &&
      retry.current.version === current.version
        ? retry.current
        : {
            replyId: crypto.randomUUID(),
            message: text,
            version: current.version,
          };
    retry.current = payload;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}/${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setThreads((previous) =>
        previous.map((thread) =>
          thread.id === current.id &&
          Date.parse(thread.version) <= Date.parse(result.thread.version)
            ? result.thread
            : thread,
        ),
      );
      setMessage("");
      retry.current = null;
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Kunne ikke sende dit svar. Prøv igen.",
      );
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void reply(message);
  }

  return (
    <>
      <BestiePushToggle />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]">
        <nav aria-label="Besties samtaler" className="panel overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 text-base font-semibold">
            Beskeder
          </h2>
          {threads.length ? (
            <ul className="divide-y divide-line">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <Link
                    aria-current={thread.id === selected ? "page" : undefined}
                    className={`block break-words px-4 py-3 hover:bg-subtle ${thread.id === selected ? "bg-brand-soft" : ""}`}
                    href={bestiePath(organizationId, thread.id)}
                  >
                    <span className="block font-semibold">{thread.title}</span>
                    {thread.unread ? (
                      <StatusBadge tone="info">Ny besked</StatusBadge>
                    ) : null}
                    <span className="mt-1 block line-clamp-2 text-sm text-muted">
                      {thread.messages.at(-1)?.body}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted">
              Du har ingen beskeder fra Bestie endnu.
            </p>
          )}
        </nav>
        {current ? (
          <section
            className="panel min-w-0 p-4 sm:p-5"
            aria-label={current.title}
          >
            <div className="border-b border-line pb-3">
              <h2 className="break-words text-lg font-semibold">
                {current.title}
              </h2>
              <Link
                href={current.href}
                className="inline-block text-sm font-semibold text-brand underline"
              >
                Åbn i appen
              </Link>
              {current.followUpOn ? (
                <p className="mt-1 text-sm text-muted">
                  Opfølgning {bestieDate(current.followUpOn)}
                </p>
              ) : null}
            </div>
            <div
              className="max-h-[55vh] space-y-3 overflow-y-auto py-4"
              role="log"
              aria-label="Samtale"
            >
              {current.messages.map((entry, index) => (
                <article
                  key={entry.id ?? index}
                  className={`max-w-[90%] rounded-xl px-3 py-2 sm:px-4 ${entry.role === "user" ? "ml-auto bg-brand-soft" : "bg-subtle"}`}
                >
                  <p className="text-xs font-semibold text-muted">
                    {entry.role === "user" ? "Dig" : "Bestie"}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {entry.body}
                  </p>
                </article>
              ))}
              <div ref={end} />
            </div>
            {current.pending ? (
              <div className="mb-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  type="button"
                  disabled={busy}
                  onClick={() => void reply("Godkend")}
                >
                  Godkend forslag
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void reply("Afvis")}
                >
                  Afvis
                </Button>
              </div>
            ) : null}
            <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
              <label htmlFor="bestie-reply" className="sr-only">
                Svar til Bestie
              </label>
              <textarea
                id="bestie-reply"
                ref={input}
                rows={2}
                maxLength={1500}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-line-strong bg-canvas p-3 text-sm"
                placeholder="Skriv dit svar …"
              />
              <Button disabled={busy || !message.trim()} type="submit">
                {busy ? "Sender …" : "Svar"}
              </Button>
            </form>
            {error ? (
              <p className="mt-2 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
          </section>
        ) : (
          <EmptyState
            title={
              selected ? "Samtalen er ikke tilgængelig" : "Vælg en samtale"
            }
          />
        )}
      </div>
    </>
  );
}
