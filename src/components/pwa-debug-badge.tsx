"use client";

import { useEffect, useState } from "react";

type PwaStatus = "kontrol-ediliyor" | "hazir" | "hazir-degil";

export function PwaDebugBadge() {
  const [status, setStatus] = useState<PwaStatus>("kontrol-ediliyor");
  const [details, setDetails] = useState<string>("SW: ?, Secure: ?, Mode: ?");

  useEffect(() => {
    let matched = false;

    const handleBeforeInstallPrompt = () => {
      matched = true;
      setStatus("hazir");
      void updateDetails("hazir");
    };

    const updateDetails = async (nextStatus?: PwaStatus) => {
      const isSecure = typeof window !== "undefined" ? window.isSecureContext : false;
      const displayStandalone =
        typeof window !== "undefined" && typeof window.matchMedia === "function"
          ? window.matchMedia("(display-mode: standalone)").matches
          : false;

      let serviceWorkerState = "desteksiz";

      if ("serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          serviceWorkerState = registration ? "kayitli" : "kayitsiz";
        } catch {
          serviceWorkerState = "hata";
        }
      }

      setDetails(
        `SW: ${serviceWorkerState} | Secure: ${isSecure ? "evet" : "hayir"} | Mode: ${
          displayStandalone ? "standalone" : "browser"
        }${nextStatus === "hazir" ? " | Prompt: var" : nextStatus === "hazir-degil" ? " | Prompt: yok" : ""}`
      );
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    void updateDetails();

    const timer = window.setTimeout(() => {
      if (!matched) {
        setStatus("hazir-degil");
        void updateDetails("hazir-degil");
      }
    }, 2500);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className={`pwa-debug-shell pwa-debug-shell-${status}`}>
      <span className={`pwa-debug-badge pwa-debug-badge-${status}`}>
        {status === "hazir"
          ? "PWA hazir"
          : status === "hazir-degil"
            ? "PWA hazir degil"
            : "PWA kontrol ediliyor"}
      </span>
      <div className="pwa-debug-details">{details}</div>
    </div>
  );
}
