"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { buttonClassName } from "@/components/ui";

export function TrashAccessDenied({
  organizationId,
}: {
  organizationId: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="mx-auto max-w-2xl py-8">
      <p className="page-eyebrow">Adgang</p>
      <h1 className="page-title mt-2" ref={headingRef} tabIndex={-1}>
        Du har ikke adgang til Papirkurv
      </h1>
      <p className="mt-4 text-sm text-muted">
        Papirkurven administreres af organisationens ejer eller administrator.
        Kontakt en administrator, hvis et element skal gendannes.
      </p>
      <Link
        className={buttonClassName({ variant: "secondary", className: "mt-6" })}
        href={`/organizations/${organizationId}`}
      >
        Tilbage til overblik
      </Link>
    </section>
  );
}
