import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";

export default function SignupPage() {
  return (
    <>
      <h1 className="text-3xl font-bold">Opret din konto</h1>
      <p className="mt-2 text-sm text-slate-600">
        Start med en organisation, og opret derefter dens udvalg.
      </p>
      <div className="mt-8">
        <AuthForm mode="signup" />
      </div>
      <p className="mt-6 text-center text-sm text-slate-600">
        Har du allerede en konto?{" "}
        <Link className="font-semibold text-forest" href="/login">
          Log ind
        </Link>
      </p>
    </>
  );
}
