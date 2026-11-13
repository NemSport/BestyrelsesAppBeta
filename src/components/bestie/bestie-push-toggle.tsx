"use client";

import { useEffect, useState } from "react";
import { AppIcon } from "@/components/icons/app-icon";
import { Button } from "@/components/ui";

function applicationServerKey(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(
    atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    (char) => char.charCodeAt(0),
  );
}

export function BestiePushToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [publicKey, setPublicKey] = useState("");
  const [userId, setUserId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setFeedback("Denne browser viser Besties beskeder i appen.");
      return;
    }
    let active = true;
    void Promise.all([
      fetch("/api/bestie/push", { cache: "no-store" }).then((response) =>
        response.json(),
      ),
      navigator.serviceWorker
        .getRegistration()
        .then((registration) => registration?.pushManager.getSubscription()),
    ])
      .then(([config, subscription]) => {
        if (!active) return;
        if (!config.userId) throw new Error();
        setUserId(config.userId);
        setPublicKey(config.publicKey ?? "");
        setEnabled(
          Boolean(
            subscription &&
            localStorage.getItem("bestie-push-account") === config.userId,
          ),
        );
        if (!config.publicKey)
          setFeedback("Pushnotifikationer er ikke sat op endnu.");
      })
      .catch(() => {
        if (active)
          setFeedback("Kunne ikke hente dine notifikationsindstillinger.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function toggle() {
    setBusy(true);
    setFeedback("");
    try {
      if (!enabled && (await Notification.requestPermission()) !== "granted") {
        setFeedback(
          "Giv tilladelse til notifikationer i browserens indstillinger.",
        );
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      const ready = registration.active
        ? registration
        : await navigator.serviceWorker.ready;
      let subscription = await ready.pushManager.getSubscription();
      if (!enabled && !subscription) {
        subscription = await ready.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(publicKey),
        });
      }
      if (subscription) {
        const response = await fetch("/api/bestie/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...subscription.toJSON(), enabled: !enabled }),
        });
        if (!response.ok) {
          if (!enabled) await subscription.unsubscribe();
          throw new Error();
        }
        if (enabled) await subscription.unsubscribe();
      }
      if (enabled) localStorage.removeItem("bestie-push-account");
      else localStorage.setItem("bestie-push-account", userId);
      setEnabled(!enabled);
    } catch {
      setFeedback("Kunne ikke ændre notifikationer på denne enhed. Prøv igen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="bestie-push-title"
      className="rounded-xl border border-brand/25 bg-brand-soft p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            id="bestie-push-title"
            className="flex items-center gap-2 font-semibold"
          >
            <AppIcon name="actions" size={19} aria-hidden="true" />
            Pushnotifikationer
          </h2>
          <p className="mt-1 text-sm text-muted">
            {enabled === null
              ? "Få besked på denne enhed, når Bestie skriver."
              : enabled
                ? "Slået til på denne enhed."
                : "Slået fra på denne enhed."}
          </p>
        </div>
        {enabled !== null && (publicKey || enabled) ? (
          <Button
            type="button"
            variant={enabled ? "secondary" : "primary"}
            className="min-h-11 w-full justify-center sm:w-auto"
            disabled={busy}
            onClick={() => void toggle()}
          >
            {enabled ? "Slå push fra" : "Slå push til"}
          </Button>
        ) : null}
      </div>
      {feedback ? (
        <p className="mt-2 text-sm text-muted" role="status">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
