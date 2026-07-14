"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PopupAnnouncementRecord } from "@/lib/popup-announcements";

type HomePopupAnnouncementProps = {
  announcements: PopupAnnouncementRecord[];
  sessionKey: string;
};

const POPUP_SESSION_STORAGE_PREFIX = "tanca:home-popups-shown:";
const POPUP_DAILY_ACK_STORAGE_PREFIX = "tanca:home-popup-read:";

function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isPopupHeadingLine(line: string) {
  const normalized = line.trim().toLowerCase();
  return (
    normalized === "gunluk ihtiyaclar:" ||
    normalized === "bilgilendirme kalemleri:" ||
    normalized === "hedefe gitmeyen kalemler:" ||
    normalized === "gercekleseni sifir olan kalemler:"
  );
}

function isPopupAlertHeadingLine(line: string) {
  const normalized = line.trim().toLowerCase();
  return normalized === "hedefe gitmeyen kalemler:" || normalized === "gercekleseni sifir olan kalemler:";
}

function isPopupAlertItemLine(lines: string[], index: number) {
  const currentLine = lines[index]?.trim() ?? "";
  if (!currentLine.startsWith("- ")) {
    return false;
  }

  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const previousLine = lines[previousIndex]?.trim() ?? "";
    if (!previousLine) {
      continue;
    }

    if (isPopupAlertHeadingLine(previousLine)) {
      return true;
    }

    if (isPopupHeadingLine(previousLine)) {
      return false;
    }

    if (!previousLine.startsWith("- ")) {
      return false;
    }
  }

  return false;
}

export function HomePopupAnnouncement({ announcements, sessionKey }: HomePopupAnnouncementProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isImageOpen, setIsImageOpen] = useState(false);
  const [canShowPopups, setCanShowPopups] = useState(false);
  const [visibleAnnouncements, setVisibleAnnouncements] = useState<PopupAnnouncementRecord[]>([]);
  const sessionCheckedRef = useRef(false);
  const announcement = visibleAnnouncements[currentIndex] ?? null;
  const currentLink = typeof announcement?.link_url === "string" ? announcement.link_url.trim() : "";
  const hasLink = currentLink.length > 0;
  const isInternalLink = currentLink.startsWith("/");
  const bodyLines = (announcement?.body ?? "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => !(line.length === 0 && lines[index - 1]?.length === 0));

  useEffect(() => {
    if (sessionCheckedRef.current || !sessionKey || announcements.length === 0) {
      return;
    }

    sessionCheckedRef.current = true;
    const storageKey = `${POPUP_SESSION_STORAGE_PREFIX}${sessionKey}`;
    const todayKey = localDayKey();
    let unreadAnnouncements = announcements;

    try {
      if (window.localStorage.getItem(storageKey) === "1") {
        setCanShowPopups(false);
        return;
      }

      window.localStorage.setItem(storageKey, "1");
      unreadAnnouncements = announcements.filter(
        (item) =>
          window.localStorage.getItem(
            `${POPUP_DAILY_ACK_STORAGE_PREFIX}${todayKey}:${item.id}`
          ) !== "1"
      );
      Object.keys(window.localStorage)
        .filter(
          (key) => key.startsWith(POPUP_SESSION_STORAGE_PREFIX) && key !== storageKey
        )
        .forEach((key) => window.localStorage.removeItem(key));

      Object.keys(window.localStorage)
        .filter(
          (key) =>
            key.startsWith(POPUP_DAILY_ACK_STORAGE_PREFIX) &&
            !key.startsWith(`${POPUP_DAILY_ACK_STORAGE_PREFIX}${todayKey}:`)
        )
        .forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Depolama kapaliysa popup mevcut sayfa omrunde yine bir kez gosterilir.
    }

    setCurrentIndex(0);
    setIsImageOpen(false);
    setVisibleAnnouncements(unreadAnnouncements);
    setCanShowPopups(unreadAnnouncements.length > 0);
  }, [announcements, sessionKey]);

  if (!canShowPopups || !announcement) {
    return null;
  }

  function closePopup() {
    setIsImageOpen(false);
    setCurrentIndex((current) => current + 1);
  }

  function acknowledgePopup() {
    if (announcement) {
      try {
        window.localStorage.setItem(
          `${POPUP_DAILY_ACK_STORAGE_PREFIX}${localDayKey()}:${announcement.id}`,
          "1"
        );
      } catch {
        // Depolama kapali olsa da mevcut popup kapatilir.
      }
    }

    closePopup();
  }

  return (
    <div
      key={`${announcement.id}-${currentIndex}`}
      className="home-popup-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="home-popup-title"
    >
      <article className="home-popup-card">
        <button className="home-popup-close" type="button" onClick={closePopup} aria-label="Bildirimi kapat">
          x
        </button>

        <h2 id="home-popup-title">{announcement.title}</h2>
        {announcement.imageUrl ? (
          <button
            className="home-popup-image-button"
            type="button"
            onClick={() => setIsImageOpen(true)}
            aria-label="Popup gorselini buyut"
          >
            <img className="home-popup-image" src={announcement.imageUrl} alt={announcement.title} />
          </button>
        ) : null}
        <div className="home-popup-body">
          {bodyLines.map((line, index) => {
            if (line.length === 0) {
              return <div key={`empty-${index}`} className="home-popup-line-spacer" aria-hidden="true" />;
            }

            const isHeading = isPopupHeadingLine(line);
            const isAlertHeading = isPopupAlertHeadingLine(line);
            const isAlertItem = isPopupAlertItemLine(bodyLines, index);

            return (
              <p
                key={`${announcement.id}-line-${index}`}
                className={[
                  "home-popup-line",
                  isHeading ? "home-popup-line-heading" : "",
                  isAlertHeading ? "home-popup-line-alert-heading" : "",
                  isAlertItem ? "home-popup-line-alert-item" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {line}
              </p>
            );
          })}
        </div>

        <div className="home-popup-actions">
          {hasLink ? (
            isInternalLink ? (
              <Link className="button-secondary" href={currentLink} onClick={closePopup}>
                Detaya Git
              </Link>
            ) : (
              <a
                className="button-secondary"
                href={currentLink}
                target="_blank"
                rel="noreferrer"
                onClick={closePopup}
              >
                Detaya Git
              </a>
            )
          ) : null}
          <button className="button-secondary" type="button" onClick={closePopup}>
            Kapat
          </button>
          <button className="button-primary" type="button" onClick={acknowledgePopup}>
            Okudum, Anladim
          </button>
        </div>
      </article>

      {isImageOpen && announcement.imageUrl ? (
        <div className="home-popup-image-viewer" role="dialog" aria-modal="true" aria-label="Popup gorseli">
          <button
            className="home-popup-image-viewer-close"
            type="button"
            onClick={() => setIsImageOpen(false)}
            aria-label="Gorseli kapat"
          >
            x
          </button>
          <img className="home-popup-image-viewer-image" src={announcement.imageUrl} alt={announcement.title} />
        </div>
      ) : null}
    </div>
  );
}
