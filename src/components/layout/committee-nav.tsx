import Link from "next/link";

export function CommitteeNav({
  organizationId,
  committeeId,
}: {
  organizationId: string;
  committeeId: string;
}) {
  const root = `/organizations/${organizationId}/committees/${committeeId}`;
  return (
    <nav
      aria-label="Udvalgsnavigation"
      className="mb-8 flex flex-wrap gap-2 border-b border-line pb-4"
    >
      <Link className="button-secondary" href={root}>
        Udvalgsoversigt
      </Link>
      <Link className="button-secondary" href={`${root}/meetings`}>
        Møder
      </Link>
      <Link className="button-secondary" href={`${root}/agenda-items`}>
        Dagsordenspunkter
      </Link>
      <Link className="button-secondary" href={`${root}/annual-wheel`}>
        Årshjul
      </Link>
    </nav>
  );
}
