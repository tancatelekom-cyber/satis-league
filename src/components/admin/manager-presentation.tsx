"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ManagerPresentationSectionKey } from "@/lib/admin/manager-presentation-sections";
import { buildManagerPresentationStoreTableKey } from "@/lib/admin/manager-presentation-store-tables";

type SummaryCard = {
  label: string;
  value: string;
  detail: string;
};

type FocusItem = {
  owner: string;
  metric: string;
  actual: number;
  target: number | null;
  projectedPercent: number | null;
  remaining: number | null;
  dailyNeed: number;
  action: string;
  note: string;
};

type HealthSnapshot = {
  owner: string;
  averagePercent: number;
  belowTargetCount: number;
  primaryRisk: string;
  strongestMetric: string;
};

type PresentationCategoryTableRow = {
  label: string;
  target: number | null;
  actual: number;
  remaining: number | null;
  actualPercent: number | null;
  projectedActual: number | null;
  projectedPercent: number | null;
  dailyNeeds: Array<{
    threshold: number;
    dailyRequired: number;
  }>;
};

type PresentationCategoryTable = {
  audience: "store" | "employee";
  title: string;
  parentTitle?: string;
  hasTarget: boolean;
  rows: PresentationCategoryTableRow[];
  totalRow: PresentationCategoryTableRow;
};

type ManagerPresentationProps = {
  actionLines: string[];
  companyFocusItems: FocusItem[];
  companyNarrative: string;
  generatedAt: string;
  summaryCards: SummaryCard[];
  storeFocusItems: FocusItem[];
  employeeFocusItems: FocusItem[];
  zeroItems: string[];
  topStores: HealthSnapshot[];
  riskStores: HealthSnapshot[];
  topEmployees: HealthSnapshot[];
  riskEmployees: HealthSnapshot[];
  storeCategoryTables: PresentationCategoryTable[];
  employeeCategoryTables: PresentationCategoryTable[];
  storeSubcategoryTables: PresentationCategoryTable[];
  employeeSubcategoryTables: PresentationCategoryTable[];
  sectionOrder?: ManagerPresentationSectionKey[];
  storeTableOrder?: string[];
  visibleSections?: ManagerPresentationSectionKey[];
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

export function ManagerPresentation({
  actionLines,
  companyFocusItems,
  companyNarrative,
  generatedAt,
  summaryCards,
  storeFocusItems,
  employeeFocusItems,
  zeroItems,
  topStores,
  riskStores,
  topEmployees,
  riskEmployees,
  storeCategoryTables,
  employeeCategoryTables,
  storeSubcategoryTables,
  employeeSubcategoryTables,
  sectionOrder = [],
  storeTableOrder = [],
  visibleSections = []
}: ManagerPresentationProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const slides = useMemo(() => {
    const items: Array<{
      id: string;
      sectionKey: ManagerPresentationSectionKey;
      title: string;
      subtitle: string;
      body: ReactNode;
      layout?: "default" | "compact";
    }> = [];

    function renderCategoryTable(table: PresentationCategoryTable, group: PresentationCategoryTableRow[]) {
      return (
        <div className="presentation-panel-stack">
          <section className="presentation-table-panel">
            <div className="presentation-panel-head">
              <span>{table.audience === "store" ? "Magaza Bazli Tablo" : "Calisan Bazli Tablo"}</span>
              <strong>
                {table.parentTitle ? `${table.parentTitle} / ${table.title}` : table.title}{" "}
                {table.audience === "store" ? "kategorisinde magazalarin" : "kategorisinde calisanlarin"} anlik durumu
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
                  {group.map((row) => (
                    <tr key={`${table.parentTitle ?? table.title}-${row.label}`}>
                      <td>{row.label}</td>
                      {table.hasTarget ? (
                        <>
                          <td>{row.target?.toLocaleString("tr-TR") ?? "-"}</td>
                          <td>{row.actual.toLocaleString("tr-TR")}</td>
                          <td>{row.remaining?.toLocaleString("tr-TR") ?? "-"}</td>
                          <td>{formatPercent(row.actualPercent)}</td>
                          <td>{row.projectedActual?.toLocaleString("tr-TR") ?? "-"}</td>
                          <td className={(row.projectedPercent ?? 0) < 100 ? "presentation-table-alert" : ""}>
                            {formatPercent(row.projectedPercent)}
                          </td>
                        </>
                      ) : (
                        <td>{row.actual.toLocaleString("tr-TR")}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>{table.totalRow.label}</td>
                    {table.hasTarget ? (
                      <>
                        <td>{table.totalRow.target?.toLocaleString("tr-TR") ?? "-"}</td>
                        <td>{table.totalRow.actual.toLocaleString("tr-TR")}</td>
                        <td>{table.totalRow.remaining?.toLocaleString("tr-TR") ?? "-"}</td>
                        <td>{formatPercent(table.totalRow.actualPercent)}</td>
                        <td>{table.totalRow.projectedActual?.toLocaleString("tr-TR") ?? "-"}</td>
                        <td className={(table.totalRow.projectedPercent ?? 0) < 100 ? "presentation-table-alert" : ""}>
                          {formatPercent(table.totalRow.projectedPercent)}
                        </td>
                      </>
                    ) : (
                      <td>{table.totalRow.actual.toLocaleString("tr-TR")}</td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>

            {table.audience === "store" && table.hasTarget ? (
              <div className="presentation-need-board">
                {group.map((row) => (
                  <article key={`store-need-${table.parentTitle ?? table.title}-${row.label}`} className="presentation-need-card">
                    <strong>{row.label}</strong>
                    <div className="presentation-need-grid">
                      {row.dailyNeeds.map((need) => (
                        <span key={`${row.label}-${need.threshold}`} className="presentation-need-pill">
                          %{need.threshold}: {need.dailyRequired}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}

                <article
                  key={`store-need-total-${table.parentTitle ?? table.title}`}
                  className="presentation-need-card presentation-need-card-total"
                >
                  <strong>{table.totalRow.label}</strong>
                  <div className="presentation-need-grid">
                    {table.totalRow.dailyNeeds.map((need) => (
                      <span key={`${table.totalRow.label}-${need.threshold}`} className="presentation-need-pill">
                        %{need.threshold}: {need.dailyRequired}
                      </span>
                    ))}
                  </div>
                </article>
              </div>
            ) : null}
          </section>
        </div>
      );
    }

    items.push({
      id: "cover",
      sectionKey: "cover",
      title: "MAGAZA MUDURLERI SUNUMU",
      subtitle: `Anlik hedef gerceklesen bazli yonetim anlatimi | ${generatedAt}`,
      body: (
        <div className="presentation-cover-grid">
          <div className="presentation-cover-copy">
            <span className="presentation-kicker">Yonetim Ozeti</span>
            <h2>Bugun nerede duruyoruz, kalan gunlerde nasil kapatacagiz?</h2>
            <p>{companyNarrative}</p>
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
      id: "overview",
      sectionKey: "overview",
      title: "GENEL GORUNUM",
      subtitle: "En guclu ve en riskli magaza / calisan ozetleri",
      body: (
        <div className="presentation-two-column">
          <section className="presentation-panel">
            <div className="presentation-panel-head">
              <span>Lider Magazalar</span>
              <strong>Tempo Korunursa Hedefe En Yakin Magazalar</strong>
            </div>
            <div className="presentation-health-list">
              {topStores.map((item) => (
                <article key={`top-store-${item.owner}`} className="presentation-health-card">
                  <div>
                    <strong>{item.owner}</strong>
                    <p>En guclu alan: {item.strongestMetric}</p>
                  </div>
                  <span>{formatPercent(item.averagePercent)}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="presentation-panel">
            <div className="presentation-panel-head">
              <span>Riskli Magazalar</span>
              <strong>Bugun mudur aksiyonu gerektiren magazalar</strong>
            </div>
            <div className="presentation-health-list">
              {riskStores.map((item) => (
                <article key={`risk-store-${item.owner}`} className="presentation-health-card presentation-health-card-alert">
                  <div>
                    <strong>{item.owner}</strong>
                    <p>Birincil risk: {item.primaryRisk}</p>
                  </div>
                  <span>{formatPercent(item.averagePercent)}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="presentation-panel">
            <div className="presentation-panel-head">
              <span>Lider Calisanlar</span>
              <strong>Tempo koruyan isimler</strong>
            </div>
            <div className="presentation-health-list">
              {topEmployees.map((item) => (
                <article key={`top-employee-${item.owner}`} className="presentation-health-card">
                  <div>
                    <strong>{item.owner}</strong>
                    <p>En guclu alan: {item.strongestMetric}</p>
                  </div>
                  <span>{formatPercent(item.averagePercent)}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="presentation-panel">
            <div className="presentation-panel-head">
              <span>Riskli Calisanlar</span>
              <strong>Bire bir takip gerektiren isimler</strong>
            </div>
            <div className="presentation-health-list">
              {riskEmployees.map((item) => (
                <article key={`risk-employee-${item.owner}`} className="presentation-health-card presentation-health-card-alert">
                  <div>
                    <strong>{item.owner}</strong>
                    <p>Birincil risk: {item.primaryRisk}</p>
                  </div>
                  <span>{formatPercent(item.averagePercent)}</span>
                </article>
              ))}
            </div>
          </section>
        </div>
      )
    });

    const companyChunks = chunk(companyFocusItems, 6);
    companyChunks.forEach((group, index) => {
      items.push({
        id: `company-${index}`,
        sectionKey: "company",
        title: "FIRMA GENEL DURUMU",
        subtitle: `Firma hedef gerceklesenleri | Sayfa ${index + 1}/${companyChunks.length}`,
        body: (
          <div className="presentation-panel-stack">
            <section className="presentation-panel presentation-panel-hero">
              <div className="presentation-panel-head">
                <span>Ana mesaj</span>
                <strong>{companyNarrative}</strong>
              </div>
            </section>

            <section className="presentation-grid-3">
              {group.map((item) => (
                <article key={`company-focus-${item.metric}`} className="presentation-focus-card">
                  <span className="presentation-card-tag">Firma Kritik</span>
                  <strong>{item.metric}</strong>
                  <p>{item.note}</p>
                  <div className="presentation-focus-footer">
                    <span>{formatPercent(item.projectedPercent)}</span>
                    <small>Gunluk ihtiyac: {item.dailyNeed}</small>
                  </div>
                </article>
              ))}
            </section>

            <section className="presentation-panel">
              <div className="presentation-panel-head">
                <span>Gozden kacirilanlar</span>
                <strong>Sifir gerceklesen firma kalemleri</strong>
              </div>
              <div className="presentation-chip-cloud">
                {zeroItems.length ? (
                  zeroItems.map((item) => (
                    <span key={item} className="presentation-chip presentation-chip-alert">
                      {item}
                    </span>
                  ))
                ) : (
                  <p className="presentation-empty">Firma genelinde sifir gerceklesen kritik kalem yok.</p>
                )}
              </div>
            </section>
          </div>
        )
      });
    });

    chunk(storeFocusItems, 4).forEach((group, index, list) => {
      items.push({
        id: `stores-${index}`,
        sectionKey: "storeFocus",
        title: "MAGAZA KRITIKLERI",
        subtitle: `Mudur aksiyonu bekleyen magazalar | Sayfa ${index + 1}/${list.length}`,
        body: (
          <div className="presentation-grid-2">
            {group.map((item) => (
              <article key={`${item.owner}-${item.metric}`} className="presentation-focus-card presentation-focus-card-wide">
                <div className="presentation-focus-head">
                  <div>
                    <span className="presentation-card-tag">Magaza</span>
                    <strong>{item.owner}</strong>
                    <h3>{item.metric}</h3>
                  </div>
                  <span className="presentation-score-pill">{formatPercent(item.projectedPercent)}</span>
                </div>
                <p>{item.note}</p>
                <ul className="presentation-bullet-list">
                  <li>Kalan toplam ihtiyac: {item.remaining ?? 0}</li>
                  <li>Gunluk minimum ihtiyac: {item.dailyNeed}</li>
                  <li>Aksiyon: {item.action}</li>
                </ul>
              </article>
            ))}
          </div>
        )
      });
    });

    const orderedStoreTableEntries = [
      ...storeCategoryTables.map((table) => ({
        key: buildManagerPresentationStoreTableKey(undefined, table.title),
        table,
        title: `${table.title} MAGAZA TABLOSU`,
        subtitleBase: "Kategori bazli magaza hedef-gerceklesen tablosu"
      })),
      ...storeSubcategoryTables.map((table) => ({
        key: buildManagerPresentationStoreTableKey(table.parentTitle, table.title),
        table,
        title: `${table.parentTitle} / ${table.title} ALT KATEGORI`,
        subtitleBase: "Alt kategori bazli magaza hedef-gerceklesen tablosu"
      }))
    ].sort((left, right) => {
      const leftOrder = storeTableOrder.indexOf(left.key);
      const rightOrder = storeTableOrder.indexOf(right.key);
      const normalizedLeft = leftOrder >= 0 ? leftOrder : Number.MAX_SAFE_INTEGER;
      const normalizedRight = rightOrder >= 0 ? rightOrder : Number.MAX_SAFE_INTEGER;

      if (normalizedLeft !== normalizedRight) {
        return normalizedLeft - normalizedRight;
      }

      return left.title.localeCompare(right.title, "tr");
    });

    orderedStoreTableEntries.forEach((entry) => {
      chunk(entry.table.rows, 8).forEach((group, index, list) => {
        items.push({
          id: `store-table-${entry.key}-${index}`,
          sectionKey: "storeTables",
          title: entry.title,
          subtitle: `${entry.subtitleBase} | Sayfa ${index + 1}/${list.length}`,
          layout: "compact",
          body: renderCategoryTable(entry.table, group)
        });
      });
    });

    chunk(employeeFocusItems, 4).forEach((group, index, list) => {
      items.push({
        id: `employees-${index}`,
        sectionKey: "employeeFocus",
        title: "CALISAN KRITIKLERI",
        subtitle: `Bire bir takip gerektiren calisanlar | Sayfa ${index + 1}/${list.length}`,
        body: (
          <div className="presentation-grid-2">
            {group.map((item) => (
              <article key={`${item.owner}-${item.metric}`} className="presentation-focus-card presentation-focus-card-wide">
                <div className="presentation-focus-head">
                  <div>
                    <span className="presentation-card-tag">Calisan</span>
                    <strong>{item.owner}</strong>
                    <h3>{item.metric}</h3>
                  </div>
                  <span className="presentation-score-pill">{formatPercent(item.projectedPercent)}</span>
                </div>
                <p>{item.note}</p>
                <ul className="presentation-bullet-list">
                  <li>Kalan toplam ihtiyac: {item.remaining ?? 0}</li>
                  <li>Gunluk minimum ihtiyac: {item.dailyNeed}</li>
                  <li>Aksiyon: {item.action}</li>
                </ul>
              </article>
            ))}
          </div>
        )
      });
    });

    employeeCategoryTables.forEach((table) => {
      const matchingSubtables = employeeSubcategoryTables.filter((subtable) => subtable.parentTitle === table.title);

      items.push({
        id: `employee-table-${table.title}`,
        sectionKey: "employeeTables",
        title: `${table.title} CALISAN TABLOSU`,
        subtitle: "Kategori bazli calisan hedef-gerceklesen tablosu | Tum calisanlar tek sayfa",
        layout: "compact",
        body: renderCategoryTable(table, table.rows)
      });

      matchingSubtables.forEach((subtable) => {
        items.push({
          id: `employee-sub-table-${subtable.parentTitle}-${subtable.title}`,
          sectionKey: "employeeTables",
          title: `${subtable.parentTitle} / ${subtable.title} ALT KATEGORI`,
          subtitle: "Alt kategori bazli calisan hedef-gerceklesen tablosu | Tum calisanlar tek sayfa",
          layout: "compact",
          body: renderCategoryTable(subtable, subtable.rows)
        });
      });
    });

    chunk(actionLines, 5).forEach((group, index, list) => {
      items.push({
        id: `actions-${index}`,
        sectionKey: "actions",
        title: "KALAN GUNLER AKSIYON PLANI",
        subtitle: `Sunumda konusulacak yonetsel aksiyonlar | Sayfa ${index + 1}/${list.length}`,
        body: (
          <div className="presentation-action-stack">
            {group.map((line, itemIndex) => (
              <article key={line} className="presentation-action-card">
                <span className="presentation-action-order">{index * 5 + itemIndex + 1}</span>
                <div>
                  <strong>Aksiyon Basligi</strong>
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
      sectionKey: "closing",
      title: "KAPANIS MESAJI",
      subtitle: "Sunum cikisi icin yonetsel ozet",
      body: (
        <div className="presentation-closing-card">
          <span className="presentation-kicker">Toplantida verilecek mesaj</span>
          <h2>
            Her magazanin bugunden itibaren kalan gunluk minimum ihtiyacini vardiya bazli yonetmesi, calisan bazli bire bir takibi
            saatlik hale getirmesi gerekiyor.
          </h2>
          <p>
            Kritik alanlarda anlik geri bildirim, sifir gerceklesen kalemlerde ayni gun kontrol listesi ve hedef altindaki her ana
            kategoride net gunluk mikro hedef beklenecek.
          </p>
        </div>
      )
    });

    const sectionOrderMap = new Map(
      (sectionOrder.length ? sectionOrder : ["cover", "overview", "company", "storeFocus", "storeTables", "employeeFocus", "employeeTables", "actions", "closing"]).map(
        (sectionKey, index) => [sectionKey, index] as const
      )
    );

    const visibleSectionSet = new Set(
      (visibleSections.length ? visibleSections : ["cover", "overview", "company", "storeFocus", "storeTables", "employeeFocus", "employeeTables", "actions", "closing"])
    );

    return items
      .filter((item) => visibleSectionSet.has(item.sectionKey))
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        const leftOrder = sectionOrderMap.get(left.item.sectionKey) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = sectionOrderMap.get(right.item.sectionKey) ?? Number.MAX_SAFE_INTEGER;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return left.index - right.index;
      })
      .map(({ item }) => item);
  }, [
    actionLines,
    companyFocusItems,
    companyNarrative,
    employeeFocusItems,
    generatedAt,
    riskEmployees,
    riskStores,
    storeFocusItems,
    storeCategoryTables,
    storeSubcategoryTables,
    summaryCards,
    topEmployees,
    topStores,
    employeeCategoryTables,
    employeeSubcategoryTables,
    sectionOrder,
    storeTableOrder,
    visibleSections,
    zeroItems
  ]);

  function isCompactSlide() {
    if (activeSlide.layout === "compact") {
      return true;
    }

    return activeSlide.title.length > 22;
  }

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

  const activeSlide = slides[activeIndex];
  const compactSlide = isCompactSlide();

  return (
    <main className="presentation-shell">
      <div className="presentation-control-bar">
        <div className="presentation-control-copy">
          <strong>Mudur Sunumu</strong>
          <span>
            {activeIndex + 1} / {slides.length}
          </span>
        </div>

        <div className="presentation-control-actions">
          <Link className="button-secondary" href="/admin">
            Admina Don
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
