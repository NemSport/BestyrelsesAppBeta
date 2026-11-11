import Link from "next/link";
import { PasswordRecoveryRequest } from "@/components/auth/password-recovery-request";
import { authHref, getAuthRedirect } from "@/lib/auth-navigation";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; state?: string }>;
}) {
  const { next, state } = await searchParams;
  const destination = getAuthRedirect(next);
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">Glemt adgangskode</h1>
      {state === "invalid" ? (
        <p className="text-sm text-danger" role="alert">
          Linket kunne ikke bruges. Bed om et nyt, og åbn det i samme browser.
        </p>
      ) : null}
      <PasswordRecoveryRequest next={destination} />
      <Link
        className="text-sm font-semibold text-brand"
        href={authHref("/login", destination)}
      >
        Tilbage til login
      </Link>
    </div>
  );
}
