"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
      <div className="panel w-full p-8">
        <h1 className="text-2xl font-bold">Noget gik galt</h1>
        <p className="mt-3 text-sm text-slate-600">{error.message}</p>
        <button className="button-primary mt-6" onClick={reset}>
          Prøv igen
        </button>
      </div>
    </main>
  );
}
