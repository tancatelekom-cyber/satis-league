"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalling(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (!deferredPrompt) {
    return null;
  }

  async function handleInstall() {
    if (!deferredPrompt) {
      return;
    }

    const promptEvent = deferredPrompt;

    try {
      setIsInstalling(true);
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } finally {
      setDeferredPrompt(null);
      setIsInstalling(false);
    }
  }

  return (
    <button className="button-secondary install-app-button" type="button" onClick={handleInstall} disabled={isInstalling}>
      {isInstalling ? "Yukleniyor" : "Uygulamayi Yukle"}
    </button>
  );
}
