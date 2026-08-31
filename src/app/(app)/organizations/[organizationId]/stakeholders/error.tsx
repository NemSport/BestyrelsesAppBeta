"use client";

import { Button } from "@/components/ui";

export default function StakeholdersError({ reset }: { reset: () => void }) {
  return (
    <section
      className="rounded-[var(--radius-panel)] border border-danger/25 bg-danger/5 px-4 py-6"
      role="alert"
    >
      <h2 className="text-lg font-semibold">
        Interessenterne kunne ikke indlæses
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Prøv igen. Dine eksisterende relationer og dokumenter er ikke ændret.
      </p>
      <Button className="mt-4" onClick={reset} type="button">
        Prøv igen
      </Button>
    </section>
  );
}
