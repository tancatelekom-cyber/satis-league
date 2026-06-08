"use client";

import Link from "next/link";
import type { ReactNode, TouchEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type SummaryCard = {
  label: string;
  value: string;
  detail: string;
};

type ActionItem = {
  title: string;
  owner: string;
  summary: string;
  reason: string;
  dailyTarget: string;
  followUp: string;
};

type CategorySummaryRow = {
  label: string;
  target: number | null;
  actual: number;
  remaining: number | null;
  actualPercent: number | null;
  projectedActual: number | null;
  projectedPercent: number | null;
  dailyNeed?: number;
};

type CategoryShareRow = {
  label: string;
  actual: number;
  sharePercent: number;
  projectedPercent: number | null;
  dailyNeed: number;
  companyAverage: number;
  belowCompanyAverage: boolean;
};

type EmployeeCategoryTable = {
  title: string;
  parentTitle?: string;
  hasTarget: boolean;
  rows: CategorySummaryRow[];
};

type CategoryShareTable = {
  title: string;
  parentTitle?: string;
  rows: CategoryShareRow[];
};

type StoreEvaluationPresentationProps = {
  storeName: string;
  generatedAt: string;
  storeNarrative: string;
  summaryCards: SummaryCard[];
  storeCategoryRows: CategorySummaryRow[];
  employeeCategoryTables: EmployeeCategoryTable[];
  employeeSubcategoryTables: EmployeeCategoryTable[];
  categoryShareTables: CategoryShareTable[];
  subcategoryShareTables: CategoryShareTable[];
  actionItems: ActionItem[];
  autoFullscreen?: boolean;
};

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `%${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  })}`;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1
  });
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

export function StoreEvaluationPresentation({
  storeName,
  generatedAt,
  storeNarrative,
  summaryCards,
  storeCategoryRows,
  employeeCategoryTables,
  employeeSubcategoryTables,
  categoryShareTables,
  subcategoryShareTables,
  actionItems,
  autoFullscreen = false
}: StoreEvaluationPresentationProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const slideRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; interactive: boolean } | null>(null);
  const autoFullscreenAttemptedRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [slideScale, setSlideScale] = useState(1);
  const [slideFrameHeight, setSlideFrameHeight] = useState<number | null>(null);

  const slides = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      subtitle: string;
      body: ReactNode;
      layout?: "default" | "compact";
    }> = [];

    function findShareTable(table: EmployeeCategoryTable) {
      return (
        categoryShareTables.find((item) => item.title === table.title && !item.parentTitle) ??
        subcategoryShareTables.find((item) => item.title === table.title && item.parentTitle === table.parentTitle) ??
        null
      );
    }

    function renderShareTable(table: CategoryShareTable) {
      return (
        <section className="presentation-table-panel">
          <div className="presentation-panel-head">
            <span>Sube Ici Paylar</span>
            <strong>
              {table.parentTitle ? `${table.parentTitle} / ${table.title}` : table.title} kategorisinde personel payi ve gunluk minimum ihtiyac
            </strong>
          </div>

          <div className="presentation-table-wrap">
            <table className="presentation-table">
              <thead>
                <tr>
                  <th>Calisan</th>
                  <th>Gerc.</th>
                  <th>Firma Ort.</th>
                  <th>Pay %</th>
                  <th>Ay Sonu %</th>
                  <th>Durum</th>
                  <th>Gunluk Min.</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr
                    key={`${table.parentTitle ?? table.title}-share-${row.label}`}
                    className={row.belowCompanyAverage ? "presentation-table-row-alert" : ""}
                  >
                    <td>{row.label}</td>
                    <td>{formatNumber(row.actual)}</td>
                    <td>{row.companyAverage > 0 ? formatNumber(row.companyAverage) : "-"}</td>
                    <td>{formatPercent(row.sharePercent)}</td>
                    <td className={(row.projectedPercent ?? 0) < 100 ? "presentation-table-alert" : ""}>{formatPercent(row.projectedPercent)}</td>
                    <td>{row.belowCompanyAverage ? "Firma ort. alti" : "Normal"}</td>
                    <td>{row.dailyNeed > 0 ? formatNumber(row.dailyNeed) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

    function renderEmployeeTable(table: EmployeeCategoryTable) {
      return (
        <section className="presentation-table-panel">
          <div className="presentation-panel-head">
            <span>Calisan Hedef Gerceklesenleri</span>
            <strong>
              {table.parentTitle ? `${table.parentTitle} / ${table.title}` : table.title} kategorisinde tum calisanlarin durumu
            </strong>
          </div>

          <div className="presentation-table-wrap">
            <table className="presentation-table">
              <thead>
                <tr>
                  <th>{table.title}</th>
                  {table.hasTarget ? (
                    <>
                      <th>Hedef</th>
                      <th>Gerc.</th>
                      <th>Kalan</th>
                      <th>Anlik %</th>
                      <th>Ay Sonu</th>
                      <th>Ay Sonu %</th>
                    </>
                  ) : (
                    <th>Gerc.</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={`${table.parentTitle ?? table.title}-${row.label}`}>
                    <td>{row.label}</td>
                    {table.hasTarget ? (
                      <>
                        <td>{formatNumber(row.target)}</td>
                        <td>{formatNumber(row.actual)}</td>
                        <td>{formatNumber(row.remaining)}</td>
                        <td>{formatPercent(row.actualPercent)}</td>
                        <td>{formatNumber(row.projectedActual)}</td>
                        <td className={(row.projectedPercent ?? 0) < 100 ? "presentation-table-alert" : ""}>
                          {formatPercent(row.projectedPercent)}
                        </td>
                      </>
                    ) : (
                      <td>{formatNumber(row.actual)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

    function pushEmployeeSlides(table: EmployeeCategoryTable, idPrefix: string, title: string, subtitle: string) {
      const shareTable = findShareTable(table);

      items.push({
        id: `${idPrefix}-employees`,
        title,
        subtitle,
        layout: "compact",
        body: renderEmployeeTable(table)
      });

      if (shareTable) {
        items.push({
          id: `${idPrefix}-shares`,
          title: `${title} PAY DAGILIMI`,
          subtitle: "Sube ici paylar ve gunluk minimum ihtiyac",
          layout: "compact",
          body: renderShareTable(shareTable)
        });
      }
    }

    items.push({
      id: "cover",
      title: "DEGERLENDIRME SUNUMU",
      subtitle: `${storeName} | Anlik hedef gerceklesen anlatimi | ${generatedAt}`,
      body: (
        <div className="presentation-cover-grid">
          <div className="presentation-cover-copy">
            <span className="presentation-kicker">Sube Ozeti</span>
            <h2>{storeName} ekibinin guncel durumu, magaza hedefleri ve personel dagilimi</h2>
            <p>{storeNarrative}</p>
          </div>

          <div className="presentation-summary-grid">
            {summaryCards.map((card) => (
              <article key={card.label} className="presentation-stat-card">
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <p>{card.detail}</p>
              </article>
            ))}
          </div>
        </div>
      )
    });

    items.push({
      id: "store-status",
      title: "SUBE DURUMU",
      subtitle: `${storeName} ana kategorilerde magaza hedef gerceklesen tablosu`,
      layout: "compact",
      body: (
        <div className="presentation-panel-stack">
          <section className="presentation-panel presentation-panel-hero">
            <div className="presentation-panel-head">
              <span>Ana mesaj</span>
              <strong>{storeNarrative}</strong>
            </div>
          </section>

          <section className="presentation-table-panel">
            <div className="presentation-panel-head">
              <span>Sube Hedef Gerceklesenleri</span>
              <strong>{storeName} icin magaza hedefi bazli anlik durum</strong>
            </div>

            <div className="presentation-table-wrap">
              <table className="presentation-table">
                <thead>
                  <tr>
                    <th>Kategori</th>
                    <th>Hedef</th>
                    <th>Gerc.</th>
                    <th>Kalan</th>
                    <th>Anlik %</th>
                    <th>Ay Sonu</th>
                    <th>Ay Sonu %</th>
                    <th>Gunluk Min.</th>
                  </tr>
                </thead>
                <tbody>
                  {storeCategoryRows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{formatNumber(row.target)}</td>
                      <td>{formatNumber(row.actual)}</td>
                      <td>{formatNumber(row.remaining)}</td>
                      <td>{formatPercent(row.actualPercent)}</td>
                      <td>{formatNumber(row.projectedActual)}</td>
                      <td className={(row.projectedPercent ?? 0) < 100 ? "presentation-table-alert" : ""}>
                        {formatPercent(row.projectedPercent)}
                      </td>
                      <td>{row.dailyNeed && row.dailyNeed > 0 ? formatNumber(row.dailyNeed) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )
    });

    employeeCategoryTables.forEach((table) => {
      pushEmployeeSlides(
        table,
        `employee-table-${table.title}`,
        `${table.title} PERSONEL TABLOSU`,
        "Kategori bazli tum calisan hedef gerceklesenleri"
      );

      employeeSubcategoryTables
        .filter((subtable) => subtable.parentTitle === table.title)
        .forEach((subtable) => {
          pushEmployeeSlides(
            subtable,
            `employee-sub-table-${subtable.parentTitle}-${subtable.title}`,
            `${subtable.parentTitle} / ${subtable.title} ALT KATEGORI`,
            "Alt kategori bazli calisan durumlari"
          );
        });
    });

    chunk(actionItems, 4).forEach((group, index, list) => {
      items.push({
        id: `actions-${index}`,
        title: "ALINMASI GEREKEN AKSIYONLAR",
        subtitle: `Sube ve personel bazli kapanis plani | Sayfa ${index + 1}/${list.length}`,
        body: (
          <div className="presentation-action-stack">
            {group.map((item, itemIndex) => (
              <article key={`${item.title}-${item.owner}`} className="presentation-action-card">
                <span className="presentation-action-order">{index * 4 + itemIndex + 1}</span>
                <div className="presentation-action-copy">
                  <strong>{item.title}</strong>
                  <span className="presentation-action-owner">{item.owner}</span>
                  <p>{item.summary}</p>
                  <p>{item.reason}</p>
                  <p className="presentation-action-target">{item.dailyTarget}</p>
                  <p>{item.followUp}</p>
                </div>
              </article>
            ))}
          </div>
        )
      });
    });

    items.push({
      id: "closing",
      title: "TESEKKURLER",
      subtitle: `${storeName} sunumu kapanisi`,
      body: (
        <div className="presentation-closing-card">
          <span className="presentation-kicker">Kapanis</span>
          <h2>TESEKKURLER</h2>
          <p>BOL SATISLAR</p>
        </div>
      )
    });

    return items;
  }, [
    actionItems,
    categoryShareTables,
    employeeCategoryTables,
    employeeSubcategoryTables,
    generatedAt,
    storeCategoryRows,
    storeName,
    storeNarrative,
    subcategoryShareTables,
    summaryCards
  ]);

  const activeSlide = slides[activeIndex];
  const compactSlide = activeSlide.layout === "compact" || activeSlide.title.length > 22;

  useEffect(() => {
    function syncMobileSlideFit() {
      if (typeof window === "undefined" || !stageRef.current || !slideRef.current) {
        return;
      }

      if (window.innerWidth > 860) {
        setSlideScale(1);
        setSlideFrameHeight(null);
        return;
      }

      const mobileLandscape = window.innerWidth > window.innerHeight;
      const stageRect = stageRef.current.getBoundingClientRect();
      const availableWidth = Math.max(stageRef.current.clientWidth, 1);
      const availableHeight = Math.max(window.innerHeight - stageRect.top - 18, 320);
      const measuredWidths = [
        slideRef.current.scrollWidth,
        ...Array.from(
          slideRef.current.querySelectorAll<HTMLElement>(
            ".presentation-table, .presentation-table-wrap, .presentation-summary-grid, .presentation-need-board, .presentation-action-stack"
          )
        ).map((element) => element.scrollWidth)
      ];
      const naturalWidth = Math.max(...measuredWidths, 1);
      const naturalHeight = Math.max(slideRef.current.scrollHeight, 1);
      const widthScale = availableWidth / naturalWidth;
      const heightScale = availableHeight / naturalHeight;
      const nextScale = Math.min(1, mobileLandscape ? widthScale : Math.min(widthScale, heightScale));

      setSlideScale(nextScale);
      setSlideFrameHeight(Math.ceil(naturalHeight * nextScale));
    }

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(syncMobileSlideFit);
    });

    window.addEventListener("resize", syncMobileSlideFit);
    window.addEventListener("orientationchange", syncMobileSlideFit);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", syncMobileSlideFit);
      window.removeEventListener("orientationchange", syncMobileSlideFit);
    };
  }, [activeIndex, compactSlide, fullscreen, slides.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        setActiveIndex((current) => Math.min(current + 1, slides.length - 1));
      }

      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [slides.length]);

  useEffect(() => {
    function syncFullscreen() {
      setFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  async function enterFullscreen() {
    if (!stageRef.current) {
      return;
    }

    const orientationApi = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
      unlock?: () => void;
    };

    await stageRef.current.requestFullscreen();

    if (orientationApi.lock) {
      try {
        await orientationApi.lock("landscape");
      } catch {
        // Some mobile browsers block orientation lock without a gesture or support.
      }
    }
  }

  useEffect(() => {
    if (!autoFullscreen || autoFullscreenAttemptedRef.current) {
      return;
    }

    autoFullscreenAttemptedRef.current = true;

    void enterFullscreen().catch(() => {
      // Browsers can reject fullscreen if they require a direct user gesture.
    });
  }, [autoFullscreen]);

  useEffect(() => {
    function handleOpenRequest() {
      void enterFullscreen().catch(() => {
        // Mobile browsers may still reject fullscreen if the request chain is interrupted.
      });
    }

    window.addEventListener("evaluation-presentation-open", handleOpenRequest);
    return () => window.removeEventListener("evaluation-presentation-open", handleOpenRequest);
  }, []);

  function goToPreviousSlide() {
    setActiveIndex((current) => Math.max(current - 1, 0));
  }

  function goToNextSlide() {
    setActiveIndex((current) => Math.min(current + 1, slides.length - 1));
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    const interactive = Boolean(target?.closest(".presentation-table-wrap, .presentation-dots, .presentation-control-actions"));
    const touch = event.touches[0];

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      interactive
    };
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    if (!touchStartRef.current) {
      return;
    }

    const { x, y, interactive } = touchStartRef.current;
    touchStartRef.current = null;

    if (interactive) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - x;
    const deltaY = touch.clientY - y;

    if (Math.abs(deltaX) < 70 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) {
      return;
    }

    if (deltaX < 0) {
      goToNextSlide();
      return;
    }

    goToPreviousSlide();
  }

  return (
    <main className="presentation-shell">
      <div className="presentation-control-bar">
        <div className="presentation-control-copy">
          <strong>Degerlendirme Sunumu</strong>
          <span>
            {activeIndex + 1} / {slides.length}
          </span>
        </div>

        <div className="presentation-control-actions">
          <Link className="button-secondary" href="/hedef-gerceklesen">
            Hedefe Don
          </Link>
          <button className="button-secondary" type="button" onClick={goToPreviousSlide}>
            Geri
          </button>
          <button className="button-primary" type="button" onClick={goToNextSlide}>
            Ileri
          </button>
        </div>
      </div>

      <section ref={stageRef} className="presentation-stage" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className={`presentation-rotate-hint ${fullscreen ? "presentation-rotate-hint-visible" : ""}`} aria-hidden={!fullscreen}>
          <div className="presentation-rotate-card">
            <div className="presentation-rotate-phones">
              <span className="presentation-rotate-phone presentation-rotate-phone-portrait" />
              <span className="presentation-rotate-arrow">{"->"}</span>
              <span className="presentation-rotate-phone presentation-rotate-phone-landscape" />
            </div>
            <strong>Telefonu Yatay Moda Cevir</strong>
            <p>Tam ekran sunum mobilde yatay konumda daha okunakli gorunur.</p>
          </div>
        </div>
        <div
          className={`presentation-slide-fit-frame ${slideScale < 0.999 ? "presentation-slide-fit-frame-active" : ""}`}
          style={slideFrameHeight ? { height: `${slideFrameHeight}px` } : undefined}
        >
          <article
            ref={slideRef}
            className={`presentation-slide ${compactSlide ? "presentation-slide-compact" : ""}`}
            style={
              slideScale < 0.999
                ? {
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: `${100 / slideScale}%`,
                    transform: `scale(${slideScale})`,
                    transformOrigin: "top left"
                  }
                : undefined
            }
          >
            <div className={`presentation-slide-head ${compactSlide ? "presentation-slide-head-compact" : ""}`}>
              <span className="presentation-kicker">{activeSlide.subtitle}</span>
              <h1>{activeSlide.title}</h1>
            </div>

            <div className="presentation-slide-body">{activeSlide.body}</div>
          </article>
        </div>
      </section>

      <div className="presentation-dots" aria-hidden="true">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            className={`presentation-dot ${index === activeIndex ? "presentation-dot-active" : ""}`}
            type="button"
            onClick={() => setActiveIndex(index)}
          />
        ))}
      </div>
    </main>
  );
}
