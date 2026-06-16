"use client";

import { useRouter } from "next/navigation";
import clsx from "clsx";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      className={clsx("text-sm text-muted transition hover:text-ink", className)}
      onClick={async () => {
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
          const key = localStorage.key(index);
          if (key?.startsWith("committee-minutes:")) {
            localStorage.removeItem(key);
          }
        }
        navigator.serviceWorker?.controller?.postMessage({
          type: "CLEAR_OFFLINE_CACHE",
        });
        await createClient().auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      type="button"
    >
      Log ud
    </button>
  );
}
