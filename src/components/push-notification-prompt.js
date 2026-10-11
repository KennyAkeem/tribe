"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, X } from "lucide-react";

const DISMISS_DAYS = 30;
const EXPERIENCE_DELAY_MS = 90_000;

function applicationServerKeyToBytes(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0));
}

async function persistSubscription(subscription) {
  const response = await fetch("/api/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "Could not save this device's notification settings.");
  }
}

export default function PushNotificationPrompt({ userId }) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [promptAvailable, setPromptAvailable] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!userId || !publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return undefined;

    let active = true;
    let timer;
    const dismissKey = `tribe-push-dismissed:${userId}`;

    async function checkSubscription() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await persistSubscription(subscription.toJSON());
          if (active) setIsSubscribed(true);
        }
      } catch {
        if (active) setError("Push notifications are unavailable on this device right now.");
      }
    }

    void checkSubscription();
    timer = window.setTimeout(() => {
      const dismissedUntil = Number(window.localStorage.getItem(dismissKey) || 0);
      if (active && !isSubscribed && dismissedUntil < Date.now() && Notification.permission !== "denied") {
        setPromptAvailable(true);
      }
    }, EXPERIENCE_DELAY_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [userId, publicKey, isSubscribed]);

  function dismissPrompt() {
    window.localStorage.setItem(`tribe-push-dismissed:${userId}`, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
    setPromptAvailable(false);
    setError("");
  }

  async function toggleNotifications() {
    if (busy || !publicKey) return;
    setBusy(true);
    setError("");
    try {
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const isInstalled = navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;
      if (isIos && !isInstalled) {
        throw new Error("On iPhone or iPad, add Tribe to your Home Screen and open the installed app before enabling notifications.");
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        const response = await fetch("/api/push/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existingSubscription.endpoint }),
        });
        if (!response.ok) throw new Error("Could not disable notifications for this device.");
        await existingSubscription.unsubscribe();
        setIsSubscribed(false);
        setPromptAvailable(true);
        return;
      }

      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        setError(permission === "denied"
          ? "Notifications are blocked in your browser settings."
          : "Notifications were not enabled.");
        setPromptAvailable(false);
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKeyToBytes(publicKey),
      });
      await persistSubscription(subscription.toJSON());
      window.localStorage.removeItem(`tribe-push-dismissed:${userId}`);
      setIsSubscribed(true);
      setPromptAvailable(false);
    } catch (subscriptionError) {
      setError(subscriptionError.message || "Could not update notification settings.");
    } finally {
      setBusy(false);
    }
  }

  if (!userId || !("serviceWorker" in (typeof navigator === "undefined" ? {} : navigator))) return null;

  if (!publicKey) return <aside className="push-prompt" role="status">
    <div className="push-prompt-card">
      <span className="push-prompt-icon"><Bell size={20} /></span>
      <div className="push-prompt-copy">
        <p>Push alerts unavailable</p>
        <h2>Notifications aren’t configured for this site yet. Contact the site administrator.</h2>
      </div>
    </div>
  </aside>;

  return (
    <>
      {isSubscribed && (
        <button
          className="icon-button push-notification-toggle"
          type="button"
          onClick={toggleNotifications}
          disabled={busy}
          aria-label="Turn off push notifications on this device"
          title="Push notifications are on"
        >
          <BellRing size={17} />
        </button>
      )}
      {promptAvailable && !isSubscribed && (
        <aside className="push-prompt" role="dialog" aria-labelledby="push-prompt-title">
          <div className="push-prompt-card">
            <span className="push-prompt-icon"><Bell size={20} /></span>
            <div className="push-prompt-copy">
              <p>Stay connected</p>
              <h2 id="push-prompt-title">Get messages and friend requests, even when Tribe is closed.</h2>
            </div>
            <div className="push-prompt-actions">
              <button type="button" className="push-prompt-enable" onClick={toggleNotifications} disabled={busy}>
                {busy ? "Enabling..." : "Turn on"}
              </button>
              <button type="button" className="push-prompt-dismiss" onClick={dismissPrompt} aria-label="Not now"><X size={17} /></button>
            </div>
            {error && <p className="push-prompt-error" role="status">{error}</p>}
          </div>
        </aside>
      )}
    </>
  );
}
