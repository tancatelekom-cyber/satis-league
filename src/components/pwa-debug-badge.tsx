"use client";

import { useEffect, useState } from "react";

export function PwaDebugBadge() {
  const [status, setStatus] = useState<"kontrol-ediliyor" | "hazir" | "hazir-degil">("kontrol-ediliyor");

  useEffect(() => {
    let matched = false;

    const handleBeforeInstallPrompt = () => {
      matched = true;
      setStatus("hazir");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    const timer = window.setTimeout(() => {
      if (!matched) {
        setStatus("hazir-degil");
      }
    }, 2500);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <span className={`pwa-debug-badge pwa-debug-badge-${status}`}>
      {status === "hazir"
        ? "PWA hazir"
        : status === "hazir-degil"
          ? "PWA hazir degil"
          : "PWA kontrol ediliyor"}
    </span>
  );
}
