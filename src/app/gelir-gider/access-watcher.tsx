"use client";

import { useEffect } from "react";

export function RevenueExpenseAccessWatcher() {
  useEffect(() => {
    const clearAccess = () => {
      void fetch("/gelir-gider/session", {
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
