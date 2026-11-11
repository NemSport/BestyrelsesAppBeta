"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import {
  passwordRecoveryCallback,
  passwordRecoveryDestinationCookie,
} from "@/lib/auth-navigation";
import { createClient } from "@/lib/supabase/client";

export function PasswordRecoveryRequest({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(form: FormData) {
    setPending(true);
    setFailed(false);
    try {
      const callback = new URL(
        passwordRecoveryCallback,
        window.location.origin,
      );
      const secure = callback.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${passwordRecoveryDestinationCookie}=${encodeURIComponent(next)}; Path=${passwordRecoveryCallback}; SameSite=Lax; Max-Age=3600${secure}`;
      const { error } = await createClient().auth.resetPasswordForEmail(
        String(form.get("email") ?? "").trim(),
        { redirectTo: callback.href },
      );
      if (error) {
        setFailed(true);
      } else {
        setSent(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <p role="status">
        Hvis der findes en konto med adressen, får du et link på e-mail. Åbn
        linket i den samme browser.
      </p>
    );
  }

  return (
    <form action={submit} className="space-y-4">
      <label className="label" htmlFor="recovery-email">
        E-mail
      </label>
      <Input
        id="recovery-email"
        name="email"
        type="email"
        required
        autoComplete="email"
      />
      {failed ? (
        <p className="text-sm text-danger" role="alert">
          Linket kunne ikke sendes lige nu. Prøv igen senere.
        </p>
      ) : null}
      <Button disabled={pending} type="submit">
        {pending ? "Sender…" : "Send nulstillingslink"}
      </Button>
    </form>
  );
}
