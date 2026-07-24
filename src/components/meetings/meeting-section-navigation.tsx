"use client";

import { useEffect, useState } from "react";

export type MeetingSectionLink = {
  id: string;
  label: string;
  count?: number;
};

function currentHashId() {
  return window.location.hash.replace(/^#/, "");
}

function matchesSection(hashId: string, sectionId: string) {
  if (hashId === sectionId) return true;
  if (
    sectionId === "agenda-minutes-heading" &&
    hashId.startsWith("agenda-point-")
  ) {
    return true;
  }
  return (
    sectionId === "general-minutes-heading" &&
    hashId === "general-minutes-content"
  );
}

export function activateMeetingSection(hashId = currentHashId()) {
  if (!hashId) return;
  const target = document.getElementById(hashId);
  if (!target) return;

  let disclosure = target.closest<HTMLDetailsElement>("details");
  while (disclosure) {
    disclosure.open = true;
    disclosure =
      disclosure.parentElement?.closest<HTMLDetailsElement>("details") ?? null;
  }
  const targetIsDetails = target.tagName === "DETAILS";
  if (targetIsDetails) (target as HTMLDetailsElement).open = true;

  window.setTimeout(() => {
    const focusTarget = targetIsDetails
      ? target.querySelector<HTMLElement>("summary")
      : target;
    target.scrollIntoView({ block: "start" });
    if (focusTarget && typeof focusTarget.focus === "function") {
      if (!focusTarget.hasAttribute("tabindex") && focusTarget.tabIndex < 0) {
        focusTarget.setAttribute("tabindex", "-1");
      }
      focusTarget.focus({ preventScroll: true });
    }
  }, 0);
}

export function MeetingSectionNavigation({
  sections,
}: {
  sections: MeetingSectionLink[];
}) {
  const [hashId, setHashId] = useState("");

  useEffect(() => {
    function synchronizeHash() {
      const nextHashId = currentHashId();
      setHashId(nextHashId);
      activateMeetingSection(nextHashId);
    }

    synchronizeHash();
    window.addEventListener("hashchange", synchronizeHash);
    return () => window.removeEventListener("hashchange", synchronizeHash);
  }, []);

  return (
    <nav
      aria-label="Gå til sektion i mødet"
      className="mt-4 border-y border-line bg-surface/95 py-1"
    >
      <ul className="flex max-w-full gap-2 overflow-x-auto overscroll-x-contain px-1 sm:flex-wrap sm:overflow-visible">
        {sections.map((section) => (
          <li className="shrink-0" key={section.id}>
            <a
              aria-current={
                matchesSection(hashId, section.id) ? "location" : undefined
              }
              className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-ink underline decoration-brand/40 underline-offset-4 transition hover:border-brand/50 hover:text-brand aria-[current=location]:border-brand aria-[current=location]:bg-mist aria-[current=location]:text-brand"
              href={`#${section.id}`}
              onClick={() =>
                window.setTimeout(() => activateMeetingSection(section.id), 0)
              }
            >
              {section.label}
              {section.count !== undefined ? (
                <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">
                  {section.count}
                </span>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
