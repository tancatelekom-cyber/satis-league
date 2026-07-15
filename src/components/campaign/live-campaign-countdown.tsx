"use client";

import { useEffect, useState } from "react";

type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function getCountdownParts(endAt: string): CountdownParts {
  const remainingSeconds = Math.max(0, Math.floor((new Date(endAt).getTime() - Date.now()) / 1000));

  return {
    days: Math.floor(remainingSeconds / 86400),
    hours: Math.floor((remainingSeconds % 86400) / 3600),
    minutes: Math.floor((remainingSeconds % 3600) / 60),
    seconds: remainingSeconds % 60
  };
}

export function LiveCampaignCountdown({ endAt }: { endAt: string }) {
  const [countdown, setCountdown] = useState<CountdownParts | null>(null);

  useEffect(() => {
    const updateCountdown = () => setCountdown(getCountdownParts(endAt));

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);

    return () => window.clearInterval(intervalId);
  }, [endAt]);

  const values = [
    { label: "GUN", value: countdown?.days },
    { label: "SAAT", value: countdown?.hours },
    { label: "DAKIKA", value: countdown?.minutes },
    { label: "SANIYE", value: countdown?.seconds }
  ];

  return (
    <div className="live-campaign-countdown" aria-label="Kampanyanin bitmesine kalan sure" role="timer">
      <span className="live-campaign-countdown-title">BITISE KALAN SURE</span>
      <div className="live-campaign-countdown-grid">
        {values.map((item) => (
          <span className="live-campaign-countdown-unit" key={item.label}>
            <strong>{item.value === undefined ? "--" : String(item.value).padStart(2, "0")}</strong>
            <small>{item.label}</small>
          </span>
        ))}
      </div>
    </div>
  );
}
