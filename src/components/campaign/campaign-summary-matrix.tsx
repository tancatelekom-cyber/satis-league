"use client";

import { useState } from "react";

type CampaignSummaryMatrixProps = {
  title: string;
  subtitle: string;
  columns: Array<{ id: string; label: string }>;
  rows: Array<{
    id: string;
    name: string;
    participantCells: number[];
    total: number;
  }>;
  summaryRows?: Array<{
    id: string;
    label: string;
    participantCells: number[];
    total: number;
  }>;
  exportHref?: string;
};

function MatrixTable({
  columns,
  rows,
  summaryRows
}: Pick<CampaignSummaryMatrixProps, "columns" | "rows" | "summaryRows">) {
  return (
    <table className="campaign-matrix-table">
      <thead>
        <tr>
          <th>Urun</th>
          {columns.map((participant) => (
            <th key={`matrix-head-${participant.id}`}>{participant.label}</th>
          ))}
          <th>Toplam</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((product) => (
          <tr key={`matrix-row-${product.id}`}>
            <th>{product.name}</th>
            {product.participantCells.map((value, index) => (
              <td key={`matrix-cell-${product.id}-${columns[index]?.id ?? index}`}>{value > 0 ? value : ""}</td>
            ))}
            <td className="campaign-matrix-total">{product.total}</td>
          </tr>
        ))}
      </tbody>
      {summaryRows?.length ? (
        <tfoot>
          {summaryRows.map((summary) => (
            <tr key={`matrix-summary-${summary.id}`}>
              <th>{summary.label}</th>
              {summary.participantCells.map((value, index) => (
                <td key={`matrix-summary-cell-${summary.id}-${columns[index]?.id ?? index}`}>
                  {value.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
                </td>
              ))}
              <td className="campaign-matrix-total">
                {summary.total.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tfoot>
      ) : null}
    </table>
  );
}

export function CampaignSummaryMatrix({
  title,
  subtitle,
  columns,
  rows,
  summaryRows,
  exportHref
}: CampaignSummaryMatrixProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="live-sale-summary campaign-product-summary" aria-label="Kampanya bazli urun ozetleri">
      <div className="live-sale-summary-head campaign-matrix-head">
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className="campaign-matrix-actions">
          {exportHref ? (
            <a className="campaign-matrix-open-button campaign-matrix-excel-button" href={exportHref}>
              Excel Indir
            </a>
          ) : null}
          <button
            type="button"
            className="campaign-matrix-open-button"
            onClick={() => setIsOpen(true)}
            aria-label="Urun ozet tablosunu tam ekran ac"
          >
            Tam Ekran Ac
          </button>
        </div>
      </div>

      <div className="campaign-matrix-wrap">
        <MatrixTable columns={columns} rows={rows} summaryRows={summaryRows} />
      </div>

      {isOpen ? (
        <div className="campaign-matrix-modal" role="dialog" aria-modal="true" aria-label="Urun ozet tablosu">
          <div className="campaign-matrix-modal-backdrop" onClick={() => setIsOpen(false)} />
          <div className="campaign-matrix-modal-card">
            <div className="campaign-matrix-modal-head">
              <div>
                <strong>{title}</strong>
                <span>{subtitle}</span>
              </div>
              <button type="button" className="campaign-matrix-close" onClick={() => setIsOpen(false)}>
                Kapat
              </button>
            </div>
            <div className="campaign-matrix-wrap campaign-matrix-wrap-modal">
              <MatrixTable columns={columns} rows={rows} summaryRows={summaryRows} />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
