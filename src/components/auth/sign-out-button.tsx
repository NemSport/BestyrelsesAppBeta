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
        if (localStorage.getItem("bestie-push-account")) {
          try {
            const registration = await navigator.serviceWorker?.getRegistration();
            const subscription = await registration?.pushManager.getSubscription();
            if (subscription) {
              await fetch("/api/bestie/push", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: false, endpoint: subscription.endpoint }),
                signal: AbortSignal.timeout(2000),
              }).catch(() => {});
              await subscription.unsubscribe();
            }
          } catch {
            // Signing out remains possible when the browser's push service is unavailable.
          }
          localStorage.removeItem("bestie-push-account");
        }
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
