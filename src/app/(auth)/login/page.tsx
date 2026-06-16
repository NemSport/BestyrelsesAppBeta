import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; next?: string }>;
}) {
  const { message, next } = await searchParams;
  const redirectTo = next?.startsWith("/") && !next.startsWith("//")
    ? next
    : "/organizations";
  return (
    <>
      <h1 className="text-3xl font-bold">Velkommen tilbage</h1>
      <p className="mt-2 text-sm text-slate-600">Log ind på udvalgets arbejdsområde.</p>
      {message ? (
        <p className="mt-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      <div className="mt-8">
        <AuthForm mode="login" redirectTo={redirectTo} />
      </div>
      <p className="mt-6 text-center text-sm text-slate-600">
        Ny bruger?{" "}
        <Link className="font-semibold text-forest" href="/signup">
          Opret en konto
        </Link>
      </p>
    </>
  );
}
