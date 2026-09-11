"use client";

import { useState } from "react";
import type { MonthlyCampaignSlide, MonthlyCampaignType } from "@/lib/monthly-campaigns";

type MonthlyCampaignSliderProps = {
  slides: MonthlyCampaignSlide[];
};

const CAMPAIGN_GROUPS: Array<{ type: MonthlyCampaignType; title: string }> = [
  { type: "turkcell", title: "Turkcell Kampanyalar" },
  { type: "tanca", title: "Tanca Kampanyalar" }
];

function MonthlyCampaignGroup({
  campaignType,
  title,
  slides
}: {
  campaignType: MonthlyCampaignType;
  title: string;
  slides: MonthlyCampaignSlide[];
}) {
  const [activeSlideId, setActiveSlideId] = useState(slides[0]?.id ?? "");
  const activeSlide = slides.find((slide) => slide.id === activeSlideId) ?? slides[0] ?? null;

  return (
    <section className={`monthly-campaign-group monthly-campaign-group-${campaignType}`}>
      <div className="monthly-campaign-group-head">
        <div>
          <span>Aylık Kampanyalar</span>
          <h2>{title}</h2>
        </div>
        <strong>{slides.length} kampanya</strong>
      </div>

      {activeSlide ? (
        <>
          <div className="monthly-campaign-name-list" aria-label={`${title} kampanya seçimi`}>
            {slides.map((slide) => (
              <button
                key={slide.id}
                className={`monthly-campaign-name-button ${
                  activeSlide.id === slide.id ? "monthly-campaign-name-button-active" : ""
                }`}
                type="button"
                onClick={() => setActiveSlideId(slide.id)}
              >
                {slide.title}
              </button>
            ))}
          </div>

          <article className="monthly-campaign-selected">
            <div className="monthly-campaign-selected-toolbar">
              <strong>{activeSlide.title}</strong>
              <a
                className="monthly-campaign-download"
                href={activeSlide.imageUrl}
                target="_blank"
                rel="noreferrer"
                download
              >
                İndir
              </a>
            </div>
            <a
              className="monthly-campaign-selected-image-link"
              href={activeSlide.imageUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`${activeSlide.title} görselini tam boyutta aç`}
            >
              <img
                className="monthly-campaign-selected-image"
                src={activeSlide.imageUrl}
                alt={activeSlide.title}
              />
            </a>
          </article>
        </>
      ) : (
        <div className="monthly-campaign-group-empty">
          <strong>Henüz kampanya yok</strong>
          <span>Admin panelinden bu alana kampanya eklenebilir.</span>
        </div>
      )}
    </section>
  );
}

export function MonthlyCampaignSlider({ slides }: MonthlyCampaignSliderProps) {
  return (
    <div className="monthly-campaign-groups">
      {CAMPAIGN_GROUPS.map((group) => (
        <MonthlyCampaignGroup
          key={group.type}
          campaignType={group.type}
          title={group.title}
          slides={slides.filter((slide) => slide.campaignType === group.type)}
        />
      ))}
    </div>
  );
}
