"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AppIcon, type AppIconName } from "@/components/icons/app-icon";
import { Modal } from "@/components/ui/modal";
import {
  globalSearchCategories,
  globalSearchLabels,
  globalSearchQueryMaxLength,
  highlightedSearchParts,
  shouldApplyGlobalSearchResponse,
  type GlobalSearchCategory,
  type GlobalSearchResponse,
  type GlobalSearchResult,
  type GlobalSearchResultType,
} from "@/lib/global-search";

const debounceMs = 250;
const resultIcons: Record<GlobalSearchResultType, AppIconName> = {
  meetings: "calendar",
  agenda_items: "agenda",
  minutes: "notes",
  decisions: "decisions",
  tasks: "tasks",
  documents: "documents",
  stakeholders: "stakeholders",
  annual_wheel: "annualWheel",
};

function Highlight({ children, query }: { children: string; query: string }) {
  return highlightedSearchParts(children, query).map((part, index) =>
    part.match ? (
      <mark className="rounded-sm bg-brand-soft px-0.5 text-inherit" key={index}>
        {part.text}
      </mark>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  );
}

function SearchResultRow({
  onNavigate,
  query,
  result,
}: {
  onNavigate: () => void;
  query: string;
  result: GlobalSearchResult;
}) {
  return (
    <Link
      className="group grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-[var(--radius-control)] px-3 py-2.5 transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      href={result.href}
      onClick={onNavigate}
    >
      <span className="mt-0.5 grid size-8 place-items-center rounded-[var(--radius-control)] bg-brand-soft text-brand">
        <AppIcon name={resultIcons[result.type]} size={17} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">
          <Highlight query={query}>{result.title}</Highlight>
        </span>
        {result.description ? (
          <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted">
            <Highlight query={query}>{result.description}</Highlight>
          </span>
        ) : null}
        <span className="mt-1 block truncate text-xs font-medium text-muted">
          {result.context}
        </span>
      </span>
      {result.date ? (
        <span className="whitespace-nowrap pt-0.5 text-xs text-muted">
          {result.date}
        </span>
      ) : null}
    </Link>
  );
}

export function GlobalSearch() {
  const pathname = usePathname();
  const organizationId = pathname.match(/^\/organizations\/([^/]+)/)?.[1] ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GlobalSearchCategory>("all");
  const [response, setResponse] = useState<GlobalSearchResponse>({ query: "", groups: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (!organizationId || event.defaultPrevented || event.key.toLocaleLowerCase("en-US") !== "k") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      setOpen(true);
    }
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [organizationId]);

  useEffect(() => {
    setOpen(false);
    setQuery("");
    setCategory("all");
    setResponse({ query: "", groups: [] });
  }, [organizationId]);

  useEffect(() => {
    if (!open || !organizationId || query.trim().length < 2) {
      requestSequence.current += 1;
      setLoading(false);
      setError(null);
      setResponse({ query: query.trim(), groups: [] });
      return;
    }

    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q: query.trim(), category });
        const request = await fetch(`/api/organizations/${organizationId}/search?${params}`, {
          signal: controller.signal,
        });
        const payload = await request.json().catch(() => ({}));
        if (!request.ok) throw new Error(payload.error ?? "Søgningen kunne ikke gennemføres.");
        if (shouldApplyGlobalSearchResponse(sequence, requestSequence.current)) {
          setResponse(payload as GlobalSearchResponse);
        }
      } catch (caught) {
        if (
          controller.signal.aborted ||
          !shouldApplyGlobalSearchResponse(sequence, requestSequence.current)
        ) return;
        setError(caught instanceof Error ? caught.message : "Søgningen kunne ikke gennemføres.");
        setResponse({ query: query.trim(), groups: [] });
      } finally {
        if (shouldApplyGlobalSearchResponse(sequence, requestSequence.current)) {
          setLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [category, open, organizationId, query, retryNonce]);

  if (!organizationId) return null;

  let content: ReactNode;
  if (query.trim().length < 2) {
    content = (
      <div className="grid min-h-48 place-items-center px-4 text-center">
        <div>
          <AppIcon className="mx-auto text-muted" name="search" size={24} />
          <p className="mt-3 text-sm font-semibold text-ink">Søg i organisationens arbejde</p>
          <p className="mt-1 text-sm text-muted">Skriv mindst to tegn for at søge.</p>
        </div>
      </div>
    );
  } else if (loading) {
    content = (
      <div aria-live="polite" className="grid min-h-48 place-items-center text-sm text-muted" role="status">
        Søger…
      </div>
    );
  } else if (error) {
    content = (
      <div className="grid min-h-48 place-items-center px-4 text-center" role="alert">
        <div>
          <p className="text-sm font-semibold text-ink">Søgningen mislykkedes</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <button className="button-secondary mt-4" onClick={() => setRetryNonce((value) => value + 1)} type="button">
            Prøv igen
          </button>
        </div>
      </div>
    );
  } else if (!response.groups.length) {
    content = (
      <div className="grid min-h-48 place-items-center px-4 text-center">
        <div>
          <p className="text-sm font-semibold text-ink">Ingen resultater</p>
          <p className="mt-1 text-sm text-muted">Prøv et andet ord eller en anden kategori.</p>
        </div>
      </div>
    );
  } else {
    content = (
      <div className="space-y-5" aria-live="polite">
        {response.groups.map((group) => (
          <section aria-labelledby={`global-search-${group.type}`} key={group.type}>
            <h3 className="px-3 text-xs font-bold uppercase tracking-[0.12em] text-muted" id={`global-search-${group.type}`}>
              {group.label}
            </h3>
            <div className="mt-1 divide-y divide-line">
              {group.results.map((result) => (
                <SearchResultRow key={`${result.type}-${result.id}`} onNavigate={() => setOpen(false)} query={response.query} result={result} />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Åbn global søgning"
        className="app-header-action"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <AppIcon name="search" size={16} />
        <span className="app-header-action-label">Søg</span>
        <kbd className="app-header-search-shortcut hidden rounded border border-current/25 px-1.5 py-0.5 text-[0.65rem] font-semibold opacity-75 xl:inline">⌘K / Ctrl+K</kbd>
      </button>
      <Modal
        description="Søg i det, du har adgang til i den aktive organisation."
        initialFocusRef={inputRef}
        maxWidth="3xl"
        onClose={() => setOpen(false)}
        open={open}
        title="Global søgning"
      >
        <div className="flex min-h-0 flex-col">
          <div className="relative">
            <AppIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" name="search" size={18} />
            <label className="sr-only" htmlFor="global-search-input">Søg</label>
            <input
              autoComplete="off"
              className="field pl-11 pr-12 text-base"
              id="global-search-input"
              maxLength={globalSearchQueryMaxLength}
              onChange={(event) =>
                setQuery(event.target.value.slice(0, globalSearchQueryMaxLength))
              }
              placeholder="Søg efter møde, punkt, opgave…"
              ref={inputRef}
              type="search"
              value={query}
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line bg-subtle px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted">ESC</kbd>
          </div>
          <div aria-label="Filtrér søgeresultater" className="mt-3 flex gap-2 overflow-x-auto pb-2" role="group">
            {globalSearchCategories.map((value) => (
              <button
                aria-pressed={category === value}
                className={category === value ? "button-primary min-h-11 shrink-0 px-3 py-1.5 sm:min-h-9" : "button-secondary min-h-11 shrink-0 px-3 py-1.5 sm:min-h-9"}
                key={value}
                onClick={() => setCategory(value)}
                type="button"
              >
                {globalSearchLabels[value]}
              </button>
            ))}
          </div>
          <div className="mt-3 min-h-0 border-t border-line pt-2">{content}</div>
        </div>
      </Modal>
    </>
  );
}
