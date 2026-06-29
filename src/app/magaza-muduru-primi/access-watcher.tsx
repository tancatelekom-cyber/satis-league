"use client";

import { useEffect } from "react";

export function ManagerPrimeAccessWatcher() {
  useEffect(() => {
    const clearAccess = () => {
      void fetch("/magaza-muduru-primi/session", {
        method: "POST",
        keepalive: true,
        credentials: "same-origin"
      }).catch(() => undefined);
    };

    window.addEventListener("pagehide", clearAccess);

    return () => {
      clearAccess();
      window.removeEventListener("pagehide", clearAccess);
    };
  }, []);

  return null;
}
