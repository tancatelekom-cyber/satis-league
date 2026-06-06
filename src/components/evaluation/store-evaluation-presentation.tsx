"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type SummaryCard = {
  label: string;
  value: string;
  detail: string;
};

type EmployeeSnapshot = {
  name: string;
  totalActual: number;
  totalTarget: number | null;
  productionPointActual: number;
  sharePercent: number;
  projectedPercent: number | null;
  belowTargetCount: number;
  strongestMetric: string;
  primaryRisk: string;
  dailyNeed: number;
  targetMisses: Array<{
    metric: string;
    projectedPercent: number | null;
    dailyNeed: number;
  }>;
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

type EmployeeCategoryTableRow = CategorySummaryRow;

type EmployeeCategoryTable = {
  title: string;
  parentTitle?: string;
  hasTarget: boolean;
  rows: EmployeeCategoryTableRow[];
  totalRow: EmployeeCategoryTableRow;
};

type StoreEvaluationPresentationProps = {
  storeName: string;
  generatedAt: string;
  storeNarrative: string;
  summaryCards: SummaryCard[];
  storeCategoryRows: CategorySummaryRow[];
  employeeSnapshots: EmployeeSnapshot[];
  employeeCategoryTables: EmployeeCategoryTable[];
  employeeSubcategoryTables: EmployeeCategoryTable[];
  actionLines: string[];
};

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

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

export function StoreEvaluationPresentation({
  storeName,
  generatedAt,
  storeNarrative,
  summaryCards,
  storeCategoryRows,
  employeeSnapshots,
  employeeCategoryTables,
  employeeSubcategoryTables,
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

    function renderEmployeeTable(table: EmployeeCategoryTable) {
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
            <h2>{storeName} ekibinin guncel durumu, pay dagilimi ve hedef kapatma plani</h2>
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
      subtitle: `${storeName} ana kategorilerde hedef gerceklesen tablosu`,
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
              <strong>{storeName} icin kategori bazli anlik durum</strong>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="presentation-need-board">
              {storeCategoryRows
                .filter((row) => row.target !== null && (row.projectedPercent ?? row.actualPercent ?? 0) < 100)
                .map((row) => {
                  return (
                    <article key={`store-risk-${row.label}`} className="presentation-need-card presentation-need-card-total">
                      <strong>{row.label}</strong>
                      <div className="presentation-need-grid">
                        <span className="presentation-need-pill">Ay sonu: {formatPercent(row.projectedPercent ?? row.actualPercent)}</span>
                        <span className="presentation-need-pill">Gunluk: {formatNumber(row.dailyNeed ?? 0)} uretim</span>
                      </div>
                    </article>
                  );
                })}
            </div>
          </section>
        </div>
      )
    });

    chunk(employeeSnapshots, 8).forEach((group, index, list) => {
      items.push({
        id: `shares-${index}`,
        title: "SUBEDEKI PAYLAR",
        subtitle: `Calisanlarin sube icindeki pay dagilimi | Sayfa ${index + 1}/${list.length}`,
        body: (
          <div className="presentation-grid-2">
            {group.map((employee) => (
              <article key={`${employee.name}-${employee.primaryRisk}`} className="presentation-focus-card presentation-focus-card-wide">
                <div className="presentation-focus-head">
                  <div>
                    <span className="presentation-card-tag">Calisan</span>
                    <strong>{employee.name}</strong>
                    <h3>Sube ici pay: {formatPercent(employee.sharePercent)}</h3>
                  </div>
                  <span className="presentation-score-pill">{formatPercent(employee.projectedPercent)}</span>
                </div>

                <ul className="presentation-bullet-list">
                  <li>Toplam gerceklesen: {formatNumber(employee.totalActual)}</li>
                  <li>Uretim puani: {formatNumber(employee.productionPointActual)}</li>
                  <li>Hedef altinda kalan kategori: {employee.belowTargetCount}</li>
                  <li>En guclu alan: {employee.strongestMetric}</li>
                  <li>Birincil risk: {employee.primaryRisk}</li>
                  <li>Gunluk minimum ihtiyac: {formatNumber(employee.dailyNeed)}</li>
                </ul>

                {employee.targetMisses.length ? (
                  <div className="presentation-chip-cloud">
                    {employee.targetMisses.map((item) => (
                      <span key={`${employee.name}-${item.metric}`} className="presentation-chip presentation-chip-alert">
                        {item.metric} | {formatPercent(item.projectedPercent)} | Gunluk {formatNumber(item.dailyNeed)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )
      });
    });

    chunk(employeeSnapshots.filter((item) => item.belowTargetCount > 0), 4).forEach((group, index, list) => {
      items.push({
        id: `employee-risks-${index}`,
        title: "PERSONEL DURUMLARI",
        subtitle: `Bire bir takip gerektiren calisanlar | Sayfa ${index + 1}/${list.length}`,
        body: (
          <div className="presentation-grid-2">
            {group.map((employee) => (
              <article key={`${employee.name}-risk`} className="presentation-focus-card presentation-focus-card-wide">
                <div className="presentation-focus-head">
                  <div>
                    <span className="presentation-card-tag">Yakindan Takip</span>
                    <strong>{employee.name}</strong>
                    <h3>{employee.primaryRisk}</h3>
                  </div>
                  <span className="presentation-score-pill">{formatPercent(employee.projectedPercent)}</span>
                </div>
                <ul className="presentation-bullet-list">
                  <li>Sube payi: {formatPercent(employee.sharePercent)}</li>
                  <li>Toplam gerceklesen: {formatNumber(employee.totalActual)}</li>
                  <li>Gunluk minimum ihtiyac: {formatNumber(employee.dailyNeed)}</li>
                  <li>En guclu kategori: {employee.strongestMetric}</li>
                </ul>

                {employee.targetMisses.length ? (
                  <div className="presentation-chip-cloud">
                    {employee.targetMisses.map((item) => (
                      <span key={`${employee.name}-risk-${item.metric}`} className="presentation-chip presentation-chip-alert">
                        {item.metric} | {formatPercent(item.projectedPercent)} | Gunluk {formatNumber(item.dailyNeed)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )
      });
    });

    employeeCategoryTables.forEach((table) => {
      items.push({
        id: `employee-table-${table.title}`,
        title: `${table.title} PERSONEL TABLOSU`,
        subtitle: "Kategori bazli tum calisan hedef gerceklesenleri",
        layout: "compact",
        body: renderEmployeeTable(table)
      });

      employeeSubcategoryTables
        .filter((subtable) => subtable.parentTitle === table.title)
        .forEach((subtable) => {
          items.push({
            id: `employee-sub-table-${subtable.parentTitle}-${subtable.title}`,
            title: `${subtable.parentTitle} / ${subtable.title} ALT KATEGORI`,
            subtitle: "Alt kategori bazli tum calisan hedef gerceklesenleri",
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
          <h2>Her calisan kendi gunluk minimum ihtiyacini bilerek vardiyaya cikmali ve sube ici payini bilincli sekilde buyutmeli.</h2>
          <p>
            Hedef altindaki alanlarda bire bir takip, guclu alanlarda tempo koruma ve sube ici pay dagilimini dengeleme ayni gun icinde
            yonetilecek temel aksiyonlar olarak uygulanmali.
          </p>
        </div>
      )
    });

    return items;
  }, [
    actionLines,
    employeeCategoryTables,
    employeeSnapshots,
    employeeSubcategoryTables,
    generatedAt,
    storeCategoryRows,
    storeName,
    storeNarrative,
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

      if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
      }

      if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(slides.length - 1);
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
