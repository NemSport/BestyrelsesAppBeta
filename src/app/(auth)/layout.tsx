import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden bg-brand p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link className="text-lg font-semibold tracking-tight" href="/">
          Udvalgshukommelsen
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
            Dagsordenspunktet først
          </p>
          <h1 className="mt-4 max-w-xl text-5xl font-semibold leading-[1.08] tracking-[-0.035em] text-white">
            Bevar hele historikken for hvert emne samlet ét sted.
          </h1>
        </div>
        <p className="text-sm text-white/60">
          Organisationer → Udvalg → Dagsordenspunkter
        </p>
      </section>
      <section className="flex items-center justify-center px-[var(--space-page-x)] py-12">
        <div className="w-full max-w-md rounded-[var(--radius-panel)] bg-surface p-1 sm:p-2">
          {children}
        </div>
      </section>
    </main>
  );
}
