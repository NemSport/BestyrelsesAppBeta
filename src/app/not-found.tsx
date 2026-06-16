import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
      <div className="panel w-full p-8">
        <p className="text-sm font-semibold text-forest">404</p>
        <h1 className="mt-2 text-2xl font-bold">Siden blev ikke fundet</h1>
        <p className="mt-3 text-sm text-slate-600">
          Den valgte organisation, det valgte udvalg, møde eller dagsordenspunkt er
          ikke tilgængeligt.
        </p>
        <Link className="button-primary mt-6" href="/organizations">
          Tilbage til organisationer
        </Link>
      </div>
    </main>
  );
}
