"use client";

import { useState } from "react";
import type { PopupAnnouncementRecord } from "@/lib/popup-announcements";

type HomePopupAnnouncementProps = {
  announcement: PopupAnnouncementRecord;
};

export function HomePopupAnnouncement({ announcement }: HomePopupAnnouncementProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) {
    return null;
  }

  function closePopup() {
    setIsOpen(false);
  }

  return (
    <div className="home-popup-backdrop" role="dialog" aria-modal="true" aria-labelledby="home-popup-title">
      <article className="home-popup-card">
        <button className="home-popup-close" type="button" onClick={closePopup} aria-label="Bildirimi kapat">
          x
        </button>

        <span className="home-popup-kicker">Tanca+ Pano</span>
        <h2 id="home-popup-title">{announcement.title}</h2>
        <p>{announcement.body}</p>

        <div className="home-popup-actions">
          <button className="button-primary" type="button" onClick={closePopup}>
            Kapat
          </button>
        </div>
      </article>
    </div>
  );
}
