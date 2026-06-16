import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-[var(--space-page-x)] py-20">
      <div className="max-w-3xl">
        <p className="page-eyebrow mb-4">
          Udvalgshukommelsen
        </p>
        <h1 className="text-5xl font-semibold leading-[1.05] tracking-[-0.04em] md:text-7xl">
          Husk beslutninger. Få handlingerne udført.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
          Et fælles arbejdsområde for foreninger, klubber, frivillige organisationer
          og lokale udvalg. Bevar sammenhængen mellem hvert dagsordenspunkt,
          mødehistorikken og det næste skridt.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link className="button-primary" href="/signup">
            Opret en konto
          </Link>
          <Link className="button-secondary" href="/login">
            Log ind
          </Link>
        </div>
      </div>
    </main>
  );
}
