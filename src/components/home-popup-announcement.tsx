"use client";

import { useEffect, useState } from "react";
import type { PopupAnnouncementRecord } from "@/lib/popup-announcements";

type HomePopupAnnouncementProps = {
  announcements: PopupAnnouncementRecord[];
};

export function HomePopupAnnouncement({ announcements }: HomePopupAnnouncementProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isImageOpen, setIsImageOpen] = useState(false);
  const announcement = announcements[currentIndex] ?? null;

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
    <div className="home-popup-backdrop" role="dialog" aria-modal="true" aria-labelledby="home-popup-title">
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
        <p>{announcement.body}</p>

        <div className="home-popup-actions">
          {announcement.link_url ? (
            <a
              className="button-secondary"
              href={announcement.link_url}
              target="_blank"
              rel="noreferrer"
            >
              Detaya Git
            </a>
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
