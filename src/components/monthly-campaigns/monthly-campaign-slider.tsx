"use client";

import { useEffect, useState } from "react";
import type { MonthlyCampaignSlide } from "@/lib/monthly-campaigns";

type MonthlyCampaignSliderProps = {
  slides: MonthlyCampaignSlide[];
};

export function MonthlyCampaignSlider({ slides }: MonthlyCampaignSliderProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 4500);

    return () => window.clearInterval(timer);
  }, [slides.length]);

  if (slides.length === 0) {
    return (
      <section className="monthly-campaigns-empty">
        <strong>Henuz gorsel yok</strong>
        <p className="subtle">Admin panelinden aylik kampanya gorselleri yukleyebilirsiniz.</p>
      </section>
    );
  }

  return (
    <section className="monthly-campaigns-showcase">
      <div className="monthly-campaign-slider">
        <div
          className="monthly-campaign-slider-track"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {slides.map((slide) => (
            <article key={slide.id} className="monthly-campaign-slide">
              <img className="monthly-campaign-slide-image" src={slide.imageUrl} alt={slide.title} />
            </article>
          ))}
        </div>

        {slides.length > 1 ? (
          <>
            <button
              className="monthly-campaign-arrow monthly-campaign-arrow-left"
              type="button"
              onClick={() =>
                setActiveIndex((current) => (current === 0 ? slides.length - 1 : current - 1))
              }
              aria-label="Onceki gorsel"
            >
              {"<"}
            </button>
            <button
              className="monthly-campaign-arrow monthly-campaign-arrow-right"
              type="button"
              onClick={() => setActiveIndex((current) => (current + 1) % slides.length)}
              aria-label="Sonraki gorsel"
            >
              {">"}
            </button>
          </>
        ) : null}
      </div>

      {slides.length > 1 ? (
        <div className="monthly-campaign-dots" aria-label="Gorsel secici">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              className={`monthly-campaign-dot ${index === activeIndex ? "monthly-campaign-dot-active" : ""}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`${index + 1}. gorseli ac`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
