import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Button, Input } from "@/components/ui";
import {
  authHref,
  getAuthRedirect,
  passwordRecoveryCookie,
} from "@/lib/auth-navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; state?: string }>;
}) {
  const { next, state } = await searchParams;
  const destination = getAuthRedirect(next);
  const retryHref = authHref("/forgot-password", destination);
  const resetHref = authHref("/reset-password", destination);
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (
    !user ||
    (await cookies()).get(passwordRecoveryCookie)?.value !== user.id
  ) {
    redirect(retryHref);
  }

  async function save(form: FormData) {
    "use server";

    const cookieStore = await cookies();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || cookieStore.get(passwordRecoveryCookie)?.value !== user.id) {
      redirect(retryHref);
    }
    const password = String(form.get("password") ?? "");
    if (password.length < 8 || password !== form.get("confirmPassword")) {
      redirect(
        `${resetHref}${resetHref.includes("?") ? "&" : "?"}state=invalid`,
      );
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error)
      redirect(
        `${resetHref}${resetHref.includes("?") ? "&" : "?"}state=failed`,
      );
    cookieStore.delete(passwordRecoveryCookie);
    redirect(destination);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">Vælg en ny adgangskode</h1>
      <p className="text-sm text-muted">{user.email}</p>
      {state === "invalid" ? (
        <p className="text-sm text-danger" role="alert">
          Adgangskoderne skal være ens og have mindst 8 tegn.
        </p>
      ) : state === "failed" ? (
        <p className="text-sm text-danger" role="alert">
          Adgangskoden kunne ikke gemmes. Prøv en anden adgangskode.
        </p>
      ) : null}
      <form action={save} className="space-y-4">
        <div>
          <label className="label" htmlFor="new-password">
            Ny adgangskode
          </label>
          <Input
            id="new-password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="label" htmlFor="confirm-password">
            Gentag ny adgangskode
          </label>
          <Input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <Button type="submit">Gem ny adgangskode</Button>
      </form>
    </div>
  );
}
