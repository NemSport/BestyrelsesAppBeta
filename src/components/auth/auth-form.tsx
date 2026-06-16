"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({
  mode,
  redirectTo = "/organizations",
}: {
  mode: "login" | "signup";
  redirectTo?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(formData: FormData) {
    setLoading(true);
    setError(null);
    setFieldErrors({});
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const fullName = String(formData.get("fullName") ?? "").trim();
    const errors: Record<string, string> = {};
    if (mode === "signup" && !fullName) errors.fullName = "Navn skal udfyldes";
    if (!email) {
      errors.email = "E-mail skal udfyldes";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Indtast en gyldig e-mailadresse";
    }
    if (!password) {
      errors.password = "Adgangskode skal udfyldes";
    } else if (password.length < 8) {
      errors.password = "Adgangskoden skal være mindst 8 tegn";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Ret de markerede felter, og prøv igen.");
      setLoading(false);
      return;
    }
    const supabase = createClient();

    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } },
          });

    setLoading(false);
    if (result.error) {
      setError(
        result.error.message.toLowerCase().includes("invalid login")
          ? "E-mail eller adgangskode er forkert."
          : "Vi kunne ikke gennemføre handlingen. Kontrollér oplysningerne og prøv igen.",
      );
      return;
    }

    if (mode === "signup" && !result.data.session) {
      router.push("/login?message=Tjek din e-mail for at bekræfte din konto.");
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form action={submit} className="space-y-4" noValidate>
      {error ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      {mode === "signup" ? (
        <div>
          <label className="label" htmlFor="fullName">
            Fulde navn
          </label>
          <Input
            aria-invalid={Boolean(fieldErrors.fullName)}
            id="fullName"
            name="fullName"
          />
          {fieldErrors.fullName ? (
            <p className="mt-1 text-sm text-red-700">{fieldErrors.fullName}</p>
          ) : null}
        </div>
      ) : null}
      <div>
        <label className="label" htmlFor="email">
          E-mail
        </label>
        <Input
          aria-invalid={Boolean(fieldErrors.email)}
          id="email"
          name="email"
          type="email"
        />
        {fieldErrors.email ? (
          <p className="mt-1 text-sm text-red-700">{fieldErrors.email}</p>
        ) : null}
      </div>
      <div>
        <label className="label" htmlFor="password">
          Adgangskode
        </label>
        <Input
          id="password"
          aria-invalid={Boolean(fieldErrors.password)}
          name="password"
          required
          type="password"
        />
        {fieldErrors.password ? (
          <p className="mt-1 text-sm text-red-700">{fieldErrors.password}</p>
        ) : null}
      </div>
      <Button className="w-full" disabled={loading} type="submit">
        {loading ? "Vent venligst..." : mode === "login" ? "Log ind" : "Opret konto"}
      </Button>
    </form>
  );
}
