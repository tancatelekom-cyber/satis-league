"use client";

import { useEffect, useState } from "react";

const DATE_FORMATTER = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric"
});

const TIME_FORMATTER = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase("tr-TR") + value.slice(1);
}

export function HomeDateTime() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <section className="home-date-time" aria-label="Güncel tarih ve saat">
      <div className="home-date-time-copy">
        <span className="home-date-time-eyebrow">BUGÜN</span>
        <time className="home-current-date" dateTime={now?.toISOString()}>
          {now ? capitalize(DATE_FORMATTER.format(now)) : "Tarih yükleniyor..."}
        </time>
      </div>

      <div className="home-clock-wrap">
        <span className="home-clock-dot" aria-hidden="true" />
        <div>
          <time className="home-current-time" dateTime={now?.toISOString()}>
            {now ? TIME_FORMATTER.format(now) : "--:--:--"}
          </time>
        </div>
      </div>
    </section>
  );
}
