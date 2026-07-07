"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PopupAnnouncementRecord } from "@/lib/popup-announcements";

type HomePopupAnnouncementProps = {
  announcements: PopupAnnouncementRecord[];
};

function isPopupHeadingLine(line: string) {
  const normalized = line.trim().toLowerCase();
  return (
    normalized === "gunluk ihtiyaclar:" ||
    normalized.startsWith("eksik kalan kalemler:") ||
    normalized.startsWith("gercekleseni sifir olan kalemler:")
  );
}

export function HomePopupAnnouncement({ announcements }: HomePopupAnnouncementProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isImageOpen, setIsImageOpen] = useState(false);
  const announcement = announcements[currentIndex] ?? null;
  const currentLink = typeof announcement?.link_url === "string" ? announcement.link_url.trim() : "";
  const hasLink = currentLink.length > 0;
  const isInternalLink = currentLink.startsWith("/");
  const bodyLines = (announcement?.body ?? "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => !(line.length === 0 && lines[index - 1]?.length === 0));

  useEffect(() => {
    setCurrentIndex(0);
    setIsImageOpen(false);
  }, [announcements]);

  if (!announcement) {
    return null;
  }

  function closePopup() {
    setIsImageOpen(false);
    setCurrentIndex((current) => current + 1);
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
          {bodyLines.map((line, index) =>
            line.length === 0 ? (
              <div key={`empty-${index}`} className="home-popup-line-spacer" aria-hidden="true" />
            ) : (
              <p
                key={`${announcement.id}-line-${index}`}
                className={`home-popup-line${isPopupHeadingLine(line) ? " home-popup-line-heading" : ""}`}
              >
                {line}
              </p>
            ),
          )}
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
          <button className="button-primary" type="button" onClick={closePopup}>
            Kapat
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
