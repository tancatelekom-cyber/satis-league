"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type SummaryCard = {
  label: string;
  value: string;
  detail: string;
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
  actionLines: string[];
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
  actionLines
}: StoreEvaluationPresentationProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const slides = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      subtitle: string;
      body: ReactNode;
      layout?: "default" | "compact";
    }> = [];

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
                  <th>Pay %</th>
                  <th>Ay Sonu %</th>
                  <th>Gunluk Min.</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={`${table.parentTitle ?? table.title}-share-${row.label}`}>
                    <td>{row.label}</td>
                    <td>{formatNumber(row.actual)}</td>
                    <td>{formatPercent(row.sharePercent)}</td>
                    <td className={(row.projectedPercent ?? 0) < 100 ? "presentation-table-alert" : ""}>{formatPercent(row.projectedPercent)}</td>
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
      const shareTable =
        categoryShareTables.find((item) => item.title === table.title && !item.parentTitle) ??
        subcategoryShareTables.find((item) => item.title === table.title && item.parentTitle === table.parentTitle);

      return (
        <div className="presentation-panel-stack">
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

          {shareTable ? renderShareTable(shareTable) : null}
        </div>
      );
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
      items.push({
        id: `employee-table-${table.title}`,
        title: `${table.title} PERSONEL TABLOSU`,
        subtitle: "Kategori bazli tum calisan hedef gerceklesenleri ve sube ici paylar",
        layout: "compact",
        body: renderEmployeeTable(table)
      });

      employeeSubcategoryTables
        .filter((subtable) => subtable.parentTitle === table.title)
        .forEach((subtable) => {
          items.push({
            id: `employee-sub-table-${subtable.parentTitle}-${subtable.title}`,
            title: `${subtable.parentTitle} / ${subtable.title} ALT KATEGORI`,
            subtitle: "Alt kategori bazli calisan durumlari ve sube ici paylar",
            layout: "compact",
            body: renderEmployeeTable(subtable)
          });
        });
    });

    chunk(actionLines, 5).forEach((group, index, list) => {
      items.push({
        id: `actions-${index}`,
        title: "ALINMASI GEREKEN AKSIYONLAR",
        subtitle: `Sube ve personel bazli kapanis plani | Sayfa ${index + 1}/${list.length}`,
        body: (
          <div className="presentation-action-stack">
            {group.map((line, itemIndex) => (
              <article key={line} className="presentation-action-card">
                <span className="presentation-action-order">{index * 5 + itemIndex + 1}</span>
                <div>
                  <strong>Aksiyon</strong>
                  <p>{line}</p>
                </div>
              </article>
            ))}
          </div>
        )
      });
    });

    items.push({
      id: "closing",
      title: "TOPLANTI MESAJI",
      subtitle: `${storeName} icin kapanis vurgusu`,
      body: (
        <div className="presentation-closing-card">
          <span className="presentation-kicker">Ekibe aktarilacak mesaj</span>
          <h2>Magaza hedefi sube tablosundan, bireysel beklenti ise personel dagilimindan takip edilmeli.</h2>
          <p>
            Her calisan kendi kategorisindeki gunluk minimum ihtiyaci bilerek vardiyaya cikmali; magaza hedefini kapatmak icin personel dagilimi
            bilincli sekilde yonetilmeli.
          </p>
        </div>
      )
    });

    return items;
  }, [
    actionLines,
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

  async function toggleFullscreen() {
    if (!stageRef.current) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await stageRef.current.requestFullscreen();
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
          <button className="button-secondary" type="button" onClick={() => setActiveIndex((current) => Math.max(current - 1, 0))}>
            Geri
          </button>
          <button className="button-primary" type="button" onClick={() => setActiveIndex((current) => Math.min(current + 1, slides.length - 1))}>
            Ileri
          </button>
          <button className="button-secondary" type="button" onClick={toggleFullscreen}>
            {fullscreen ? "Tam Ekrandan Cik" : "Tam Ekran"}
          </button>
        </div>
      </div>

      <section ref={stageRef} className="presentation-stage">
        <article className={`presentation-slide ${compactSlide ? "presentation-slide-compact" : ""}`}>
          <div className={`presentation-slide-head ${compactSlide ? "presentation-slide-head-compact" : ""}`}>
            <span className="presentation-kicker">{activeSlide.subtitle}</span>
            <h1>{activeSlide.title}</h1>
          </div>

          <div className="presentation-slide-body">{activeSlide.body}</div>
        </article>
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
