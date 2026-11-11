import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { authHref, getAuthRedirect } from "@/lib/auth-navigation";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const redirectTo = getAuthRedirect((await searchParams).next);
  return (
    <>
      <h1 className="text-3xl font-bold">Opret din konto</h1>
      <p className="mt-2 text-sm text-slate-600">
        {redirectTo.startsWith("/invite/")
          ? "Brug den e-mailadresse, der modtog invitationen."
          : "Start med en organisation, og opret derefter dens udvalg."}
      </p>
      <div className="mt-8">
        <AuthForm mode="signup" redirectTo={redirectTo} />
      </div>
      <p className="mt-6 text-center text-sm text-slate-600">
        Har du allerede en konto?{" "}
        <Link className="font-semibold text-forest" href={authHref("/login", redirectTo)}>
          Log ind
        </Link>
      </p>
    </>
  );
}
