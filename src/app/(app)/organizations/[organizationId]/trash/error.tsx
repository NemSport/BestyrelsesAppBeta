"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button, buttonClassName } from "@/components/ui";

export default function OrganizationTrashError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const organizationPath = pathname.replace(/\/trash(?:\/.*)?$/, "");

  return (
    <section className="mx-auto max-w-2xl py-8">
      <p className="page-eyebrow">Papirkurv</p>
      <h1 className="page-title mt-2">Papirkurven kunne ikke indlæses</h1>
      <p className="mt-4 text-sm text-muted">
        Prøv igen, eller gå tilbage til organisationsoversigten. Ingen elementer
        er blevet ændret.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={reset}>Prøv igen</Button>
        <Link
          className={buttonClassName({ variant: "secondary" })}
          href={organizationPath || "/organizations"}
        >
          Tilbage til overblik
        </Link>
      </div>
    </section>
  );
}
