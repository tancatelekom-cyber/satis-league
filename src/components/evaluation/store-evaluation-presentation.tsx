"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode, TouchEvent } from "react";
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

const EMPLOYEE_ROWS_PER_SLIDE = 5;
const SHARE_ROWS_PER_SLIDE = 6;
const ACTION_ITEMS_PER_SLIDE = 3;

function renderCols(widths: string[]) {
  return (
    <colgroup>
      {widths.map((width, index) => (
        <col key={`${width}-${index}`} style={{ width }} />
      ))}
    </colgroup>
  );
}

function responsiveTableLabel(full: string, short: string) {
  return (
    <>
      <span className="presentation-table-label-full">{full}</span>
      <span className="presentation-table-label-short">{short}</span>
    </>
  );
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
  const stageNavRef = useRef<HTMLDivElement | null>(null);
  const slideRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; interactive: boolean } | null>(null);
  const autoFullscreenAttemptedRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [slideScale, setSlideScale] = useState(1);
  const [slideFrameHeight, setSlideFrameHeight] = useState<number | null>(null);
  const [tableFitScale, setTableFitScale] = useState(1);

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

    function renderShareTable(table: CategoryShareTable, rows: CategoryShareRow[] = table.rows) {
      return (
        <section className="presentation-table-panel">
          <div className="presentation-panel-head">
            <span>Sube Ici Paylar</span>
            <strong>
              {table.parentTitle ? `${table.parentTitle} / ${table.title}` : table.title} kategorisinde personel payi ve gunluk minimum ihtiyac
            </strong>
          </div>

          <div className="presentation-table-wrap">
            <table className="presentation-table presentation-table-fixed presentation-table-share">
              {renderCols(["24%", "10%", "12%", "10%", "12%", "20%", "12%"])}
              <thead>
                <tr>
                  <th>{responsiveTableLabel("Calisan", "Calisan")}</th>
                  <th>{responsiveTableLabel("Gerc.", "Gerc.")}</th>
                  <th>{responsiveTableLabel("Firma Ort.", "Ort.")}</th>
                  <th>{responsiveTableLabel("Pay %", "Pay")}</th>
                  <th>{responsiveTableLabel("Ay Sonu %", "Ay %")}</th>
                  <th>{responsiveTableLabel("Durum", "Durum")}</th>
                  <th>{responsiveTableLabel("Gunluk Min.", "Min.")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
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

    function renderEmployeeTable(table: EmployeeCategoryTable, rows: CategorySummaryRow[] = table.rows) {
      return (
        <section className="presentation-table-panel">
          <div className="presentation-panel-head">
            <span>Calisan Hedef Gerceklesenleri</span>
            <strong>
              {table.parentTitle ? `${table.parentTitle} / ${table.title}` : table.title} kategorisinde tum calisanlarin durumu
            </strong>
          </div>

          <div className="presentation-table-wrap">
            <table className="presentation-table presentation-table-fixed presentation-table-employee">
              {table.hasTarget
                ? renderCols(["28%", "12%", "10%", "12%", "12%", "13%", "13%"])
                : renderCols(["72%", "28%"])}
              <thead>
                <tr>
                  <th>{responsiveTableLabel(table.title, table.title)}</th>
                  {table.hasTarget ? (
                    <>
                      <th>{responsiveTableLabel("Hedef", "Hdf")}</th>
                      <th>{responsiveTableLabel("Gerc.", "Grc")}</th>
                      <th>{responsiveTableLabel("Kalan", "Kln")}</th>
                      <th>{responsiveTableLabel("Anlik %", "Anl %")}</th>
                      <th>{responsiveTableLabel("Ay Sonu", "Ay Sn")}</th>
                      <th>{responsiveTableLabel("Ay Sonu %", "Ay %")}</th>
                    </>
                  ) : (
                    <th>{responsiveTableLabel("Gerc.", "Grc")}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
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
      const employeeChunks = chunk(table.rows, EMPLOYEE_ROWS_PER_SLIDE);
      const shareChunks = shareTable ? chunk(shareTable.rows, SHARE_ROWS_PER_SLIDE) : [];

      employeeChunks.forEach((rows, index) => {
        const total = employeeChunks.length;
        items.push({
          id: `${idPrefix}-employees-${index + 1}`,
          title,
          subtitle: total > 1 ? `${subtitle} | Sayfa ${index + 1}/${total}` : subtitle,
          layout: "compact",
          body: renderEmployeeTable(table, rows)
        });
      });

      if (shareTable) {
        shareChunks.forEach((rows, index) => {
          const total = shareChunks.length;
          items.push({
            id: `${idPrefix}-shares-${index + 1}`,
            title: `${title} PAY DAGILIMI`,
            subtitle: total > 1 ? `Sube ici paylar ve gunluk minimum ihtiyac | Sayfa ${index + 1}/${total}` : "Sube ici paylar ve gunluk minimum ihtiyac",
            layout: "compact",
            body: renderShareTable(shareTable, rows)
          });
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
              <table className="presentation-table presentation-table-fixed presentation-table-store">
                {renderCols(["24%", "10%", "9%", "10%", "10%", "11%", "11%", "15%"])}
                <thead>
                  <tr>
                    <th>{responsiveTableLabel("Kategori", "Kategori")}</th>
                    <th>{responsiveTableLabel("Hedef", "Hdf")}</th>
                    <th>{responsiveTableLabel("Gerc.", "Grc")}</th>
                    <th>{responsiveTableLabel("Kalan", "Kln")}</th>
                    <th>{responsiveTableLabel("Anlik %", "Anl %")}</th>
                    <th>{responsiveTableLabel("Ay Sonu", "Ay Sn")}</th>
                    <th>{responsiveTableLabel("Ay Sonu %", "Ay %")}</th>
                    <th>{responsiveTableLabel("Gunluk Min.", "Min.")}</th>
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

    chunk(actionItems, ACTION_ITEMS_PER_SLIDE).forEach((group, index, list) => {
      items.push({
        id: `actions-${index}`,
        title: "ALINMASI GEREKEN AKSIYONLAR",
        subtitle: `Sube ve personel bazli kapanis plani | Sayfa ${index + 1}/${list.length}`,
        body: (
          <div className="presentation-action-stack">
            {group.map((item, itemIndex) => (
              <article key={`${item.title}-${item.owner}`} className="presentation-action-card">
                <span className="presentation-action-order">{index * ACTION_ITEMS_PER_SLIDE + itemIndex + 1}</span>
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
      id: "store-daily-needs",
      title: "SUBE GUNLUK IHTIYACLARI",
      subtitle: `${storeName} hedef gerceklesenine gore kategori bazli gunluk minimum beklenti`,
      layout: "compact",
      body: (
        <section className="presentation-panel-stack">
          <section className="presentation-panel presentation-panel-hero">
            <div className="presentation-panel-head">
              <span>Gunluk Takip</span>
              <strong>Kalan gunlerde kategori bazli minimum uretim ihtiyaci</strong>
            </div>
          </section>

          <div className="presentation-need-board">
            {storeCategoryRows
              .filter((row) => row.target !== null && !isNaN(row.dailyNeed ?? NaN))
              .map((row) => (
                <article key={`daily-need-${row.label}`} className="presentation-need-card">
                  <strong>{row.label}</strong>
                  <div className="presentation-need-grid">
                    <span className="presentation-need-pill">Gunluk: {formatNumber(row.dailyNeed ?? 0)}</span>
                    <span className="presentation-need-pill">Kalan: {formatNumber(row.remaining)}</span>
                    <span className="presentation-need-pill">Anlik: {formatPercent(row.actualPercent)}</span>
                    <span className="presentation-need-pill">Ay Sonu: {formatPercent(row.projectedPercent)}</span>
                  </div>
                </article>
              ))}
          </div>
        </section>
      )
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
        setTableFitScale(1);
        return;
      }

      const mobileLandscape = window.innerWidth > window.innerHeight;
      const stageRect = stageRef.current.getBoundingClientRect();
      const availableWidth = Math.max(stageRef.current.clientWidth, 1);
      const navHeight = stageNavRef.current?.offsetHeight ?? 0;
      const availableHeight = Math.max(
        (fullscreen ? stageRef.current.clientHeight : window.innerHeight - stageRect.top - 18) - navHeight - 6,
        320
      );
      const slideHead = slideRef.current.querySelector<HTMLElement>(".presentation-slide-head");
      const slideBody = slideRef.current.querySelector<HTMLElement>(".presentation-slide-body");
      const slideBodyInner = slideBody?.firstElementChild instanceof HTMLElement ? slideBody.firstElementChild : null;
      const slideStyles = window.getComputedStyle(slideRef.current);
      const slidePaddingTop = Number.parseFloat(slideStyles.paddingTop) || 0;
      const slidePaddingBottom = Number.parseFloat(slideStyles.paddingBottom) || 0;
      const slideGap = Number.parseFloat(slideStyles.rowGap || slideStyles.gap) || 0;
      const widestTableWidth = Math.max(
        0,
        ...Array.from(slideRef.current.querySelectorAll<HTMLElement>(".presentation-table")).map((element) => element.scrollWidth)
      );
      const nextTableFitScale =
        widestTableWidth > 0 ? Math.min(1, Math.max(availableWidth / widestTableWidth, mobileLandscape ? 0.78 : 0.72)) : 1;

      setTableFitScale(nextTableFitScale);

      const measuredWidths = [
        slideRef.current.scrollWidth,
        ...Array.from(
          slideRef.current.querySelectorAll<HTMLElement>(
            ".presentation-table, .presentation-table-wrap, .presentation-summary-grid, .presentation-need-board, .presentation-action-stack"
          )
        ).map((element) => element.scrollWidth)
      ];
      const naturalWidth = Math.max(...measuredWidths, 1);
      const measuredNaturalHeight =
        slidePaddingTop +
        (slideHead?.offsetHeight ?? 0) +
        slideGap +
        Math.max(slideBodyInner?.scrollHeight ?? 0, slideBodyInner?.offsetHeight ?? 0, slideBody?.scrollHeight ?? 0) +
        slidePaddingBottom;
      const naturalHeight = Math.max(measuredNaturalHeight, 1);
      const widthScale = availableWidth / naturalWidth;
      const heightScale = availableHeight / naturalHeight;
      const nextScale = Math.min(1, widthScale, heightScale);

      setSlideScale(nextScale);
      setSlideFrameHeight(Math.ceil(naturalHeight * nextScale));
    }

    const rafIds: number[] = [];
    const timeoutIds: number[] = [];
    let resizeObserver: ResizeObserver | null = null;

    const scheduleSync = () => {
      rafIds.push(
        window.requestAnimationFrame(() => {
          rafIds.push(window.requestAnimationFrame(syncMobileSlideFit));
        })
      );
    };

    scheduleSync();
    timeoutIds.push(window.setTimeout(syncMobileSlideFit, 120));
    timeoutIds.push(window.setTimeout(syncMobileSlideFit, 320));

    if (typeof ResizeObserver !== "undefined" && slideRef.current) {
      resizeObserver = new ResizeObserver(() => {
        scheduleSync();
      });

      resizeObserver.observe(slideRef.current);
      if (stageRef.current) {
        resizeObserver.observe(stageRef.current);
      }
      if (stageNavRef.current) {
        resizeObserver.observe(stageNavRef.current);
      }
    }

    window.addEventListener("resize", syncMobileSlideFit);
    window.addEventListener("orientationchange", syncMobileSlideFit);

    return () => {
      rafIds.forEach((id) => window.cancelAnimationFrame(id));
      timeoutIds.forEach((id) => window.clearTimeout(id));
      resizeObserver?.disconnect();
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
            className={`presentation-slide ${compactSlide ? "presentation-slide-compact" : ""} ${slideScale < 0.999 ? "presentation-slide-fitted" : ""}`}
            style={(() => {
              const style = {
                "--presentation-table-fit-scale": String(tableFitScale)
              } as CSSProperties & Record<string, string | number>;

              if (slideScale < 0.999) {
                style.position = "absolute";
                style.left = 0;
                style.top = 0;
                style.width = `${100 / slideScale}%`;
                style.height = "auto";
                style.minHeight = "auto";
                style.transform = `scale(${slideScale})`;
                style.transformOrigin = "top left";
              }

              return style;
            })()}
          >
            <div className={`presentation-slide-head ${compactSlide ? "presentation-slide-head-compact" : ""}`}>
              <div className="presentation-slide-head-main">
                <span className="presentation-kicker">{activeSlide.subtitle}</span>
                <h1>{activeSlide.title}</h1>
              </div>

              <div className="presentation-slide-brand" aria-hidden="true">
                <Image alt="Tanca+" className="presentation-slide-brand-image" src="/tplus-logo.png" width={80} height={80} />
              </div>
            </div>

            <div className="presentation-slide-body">{activeSlide.body}</div>

          </article>
        </div>

        <div ref={stageNavRef} className="presentation-slide-nav">
          <button className="presentation-bottom-arrow" type="button" onClick={goToPreviousSlide}>
            <span className="presentation-bottom-arrow-icon">{"<-"}</span>
            <span>Geri</span>
          </button>

          <div className="presentation-slide-nav-meta">
            <span>
              {activeIndex + 1} / {slides.length}
            </span>
          </div>

          <button className="presentation-bottom-arrow presentation-bottom-arrow-next" type="button" onClick={goToNextSlide}>
            <span>Ileri</span>
            <span className="presentation-bottom-arrow-icon">{"->"}</span>
          </button>
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
