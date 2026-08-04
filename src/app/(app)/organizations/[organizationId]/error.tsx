"use client";

import { Button } from "@/components/ui";

export default function OrganizationWorkspaceError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section
      className="border-y border-danger/25 bg-danger/5 px-4 py-6"
      role="alert"
    >
      <h2 className="text-lg font-semibold">Overblikket kunne ikke indlæses</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Prøv igen. Hvis fejlen fortsætter, kan du stadig bruge navigationen til
        møder, opgaver og udvalg.
      </p>
      <Button className="mt-4" onClick={reset} type="button">
        Prøv igen
      </Button>
    </section>
  );
}
