"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setVisible(true);
    };

    const handleAppInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (!visible) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) {
      setVisible(false);
      return;
    }

    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="install-prompt" role="dialog" aria-live="polite" aria-label="Install Tribe app">
      <div className="install-prompt-card">
        <Image src="/app-icon.jpeg" alt="Tribe app icon" className="install-prompt-icon" width={52} height={52} priority />
        <div className="install-prompt-copy">
          <p className="install-prompt-kicker">Stay connected always</p>
          <h2>Download Tribe app</h2>
        </div>
        <div className="install-prompt-actions">
          <button type="button" className="install-prompt-primary" onClick={handleInstall}>
            Install app
          </button>
          <button type="button" className="install-prompt-secondary" onClick={() => setVisible(false)}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
