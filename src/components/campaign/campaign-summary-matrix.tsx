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
    totalPoints?: number;
    basePoints?: number;
  }>;
  summaryRows?: Array<{
    id: string;
    label: string;
    participantCells: number[];
    total: number;
  }>;
  exportHref?: string;
  shareImage?: boolean;
  imageMatchups?: Array<{
    matchupNo: number;
    participantIds: string[];
  }>;
};

function formatMatrixNumber(value: number) {
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

function fitCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (context.measureText(value).width <= maxWidth) return value;

  let shortened = value;
  while (shortened.length > 3 && context.measureText(`${shortened}...`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}...`;
}

async function buildMatrixPng({
  title,
  subtitle,
  columns,
  rows,
  imageMatchups
}: Pick<CampaignSummaryMatrixProps, "title" | "subtitle" | "columns" | "rows" | "imageMatchups">) {
  const nameWidth = 250;
  const productWidth = 108;
  const totalWidth = 140;
  const tableHeaderHeight = 210;
  const rowHeight = 72;
  const matchupTitleHeight = 44;
  const matchupDividerHeight = 12;
  const footerHeight = 64;
  const participantById = new Map(columns.map((column) => [column.id, column]));
  const usedParticipantIds = new Set<string>();
  const matchupGroups = (imageMatchups ?? [])
    .map((matchup) => {
      const participants = matchup.participantIds
        .map((participantId) => participantById.get(participantId))
        .filter((participant): participant is { id: string; label: string } => Boolean(participant));
      participants.forEach((participant) => usedParticipantIds.add(participant.id));
      return { label: `ESLESME ${matchup.matchupNo}`, participants };
    })
    .filter((group) => group.participants.length > 0);
  const unmatchedParticipants = columns.filter((column) => !usedParticipantIds.has(column.id));
  if (unmatchedParticipants.length) {
    matchupGroups.push({ label: matchupGroups.length ? "DIGER KATILIMCILAR" : "ESLESMELER", participants: unmatchedParticipants });
  }
  if (!matchupGroups.length) {
    matchupGroups.push({ label: "ESLESMELER", participants: columns });
  }
  const width =
    nameWidth +
    rows.length * productWidth +
    totalWidth * 2;
  const height =
    112 +
    tableHeaderHeight +
    matchupGroups.reduce(
      (sum, group) => sum + matchupTitleHeight + Math.max(group.participants.length, 1) * rowHeight + matchupDividerHeight,
      0
    ) +
    footerHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Tablo gorseli olusturulamadi.");

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#eef7ff");
  background.addColorStop(1, "#dceef8");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#0b1d3a";
  context.font = "900 38px Arial";
  context.textAlign = "left";
  context.fillText(title, 28, 52);
  context.fillStyle = "#164f86";
  context.font = "600 21px Arial";
  context.fillText(subtitle, 28, 86);

  const tableTop = 112;
  const headers = [
    { label: "Isim", width: nameWidth },
    ...rows.map((row) => ({ label: row.name, width: productWidth })),
    { label: "Toplam Adet", width: totalWidth },
    { label: "Toplam Puan", width: totalWidth }
  ];

  let x = 0;
  headers.forEach((header, index) => {
    const isProductHeader = index > 0 && index < headers.length - 2;
    context.fillStyle = index === 0 || index >= headers.length - 2 ? "#ffe09a" : "#d8efff";
    context.fillRect(x, tableTop, header.width, tableHeaderHeight);
    context.strokeStyle = "#79cfc0";
    context.lineWidth = 2;
    context.strokeRect(x, tableTop, header.width, tableHeaderHeight);
    context.fillStyle = "#071426";
    context.font = isProductHeader ? "900 20px Arial" : "900 19px Arial";
    if (isProductHeader) {
      context.save();
      context.translate(x + header.width / 2, tableTop + tableHeaderHeight / 2);
      context.rotate(-Math.PI / 2);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(fitCanvasText(context, header.label, tableHeaderHeight - 28), 0, 0);
      context.restore();
    } else {
      context.textAlign = index === 0 ? "left" : "center";
      context.textBaseline = "alphabetic";
      context.fillText(
        fitCanvasText(context, header.label, header.width - 20),
        index === 0 ? x + 18 : x + header.width / 2,
        tableTop + tableHeaderHeight / 2 + 7
      );
    }
    x += header.width;
  });

  let currentY = tableTop + tableHeaderHeight;
  let participantStripeIndex = 0;
  matchupGroups.forEach((group, groupIndex) => {
    context.fillStyle = "#125cc8";
    context.fillRect(0, currentY, width, matchupTitleHeight);
    context.fillStyle = "#ffffff";
    context.font = "900 18px Arial";
    context.textAlign = "left";
    context.fillText(group.label, 18, currentY + 29);
    currentY += matchupTitleHeight;

    group.participants.forEach((column) => {
      const participantIndex = columns.findIndex((item) => item.id === column.id);
      const quantities = rows.map((row) => Number(row.participantCells[participantIndex] ?? 0));
      const totalQuantity = quantities.reduce((sum, value) => sum + value, 0);
      const totalPoints = rows.reduce(
        (sum, row, productIndex) => sum + quantities[productIndex] * Number(row.basePoints ?? 0),
        0
      );
      const values = [
        column.label,
        ...quantities.map((value) => (value > 0 ? formatMatrixNumber(value) : "")),
        formatMatrixNumber(totalQuantity),
        formatMatrixNumber(totalPoints)
      ];
      x = 0;

      headers.forEach((header, columnIndex) => {
        const isTotalColumn = columnIndex >= headers.length - 2;
        context.fillStyle = columnIndex === 0 || isTotalColumn
          ? participantStripeIndex % 2 === 0 ? "#fff4c8" : "#ffefb3"
          : participantStripeIndex % 2 === 0 ? "#f9fcff" : "#eef7fb";
        context.fillRect(x, currentY, header.width, rowHeight);
        context.strokeStyle = "#9eddd2";
        context.lineWidth = 2;
        context.strokeRect(x, currentY, header.width, rowHeight);
        context.fillStyle = isTotalColumn ? "#006c68" : "#071426";
        context.font = `${columnIndex === 0 || isTotalColumn ? "900" : "900"} ${columnIndex === 0 ? "19" : "21"}px Arial`;
        context.textAlign = columnIndex === 0 ? "left" : "center";
        context.textBaseline = "alphabetic";
        context.fillText(
          fitCanvasText(context, String(values[columnIndex] ?? ""), header.width - 20),
          columnIndex === 0 ? x + 18 : x + header.width / 2,
          currentY + 43
        );
        x += header.width;
      });
      currentY += rowHeight;
      participantStripeIndex += 1;
    });

    if (groupIndex < matchupGroups.length - 1) {
      const divider = context.createLinearGradient(0, currentY, width, currentY);
      divider.addColorStop(0, "#005bcc");
      divider.addColorStop(0.5, "#ffcb52");
      divider.addColorStop(1, "#ed3c36");
      context.fillStyle = divider;
      context.fillRect(0, currentY, width, matchupDividerHeight);
    }
    currentY += matchupDividerHeight;
  });

  context.fillStyle = "#125cc8";
  context.font = "700 17px Arial";
  context.textAlign = "center";
  context.fillText("TANCA+ DUELLO", width / 2, height - 24);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Tablo gorseli olusturulamadi."))),
      "image/png"
    );
  });
}

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
            <th className="campaign-matrix-participant-head" key={`matrix-head-${participant.id}`}>
              {participant.label}
            </th>
          ))}
          <th>Toplam Adet</th>
          {rows.some((row) => row.totalPoints !== undefined) ? <th>Toplam Puan</th> : null}
        </tr>
      </thead>
      <tbody>
        {summaryRows?.map((summary) => (
          <tr className="campaign-matrix-summary-row" key={`matrix-summary-${summary.id}`}>
            <th>{summary.label}</th>
            {summary.participantCells.map((value, index) => (
              <td key={`matrix-summary-cell-${summary.id}-${columns[index]?.id ?? index}`}>
                {value.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
              </td>
            ))}
            <td className="campaign-matrix-total">
              {summary.total.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
            </td>
            {rows.some((row) => row.totalPoints !== undefined) ? <td className="campaign-matrix-total">-</td> : null}
          </tr>
        ))}
        {rows.map((product) => (
          <tr key={`matrix-row-${product.id}`}>
            <th>{product.name}</th>
            {product.participantCells.map((value, index) => (
              <td key={`matrix-cell-${product.id}-${columns[index]?.id ?? index}`}>{value > 0 ? value : ""}</td>
            ))}
            <td className="campaign-matrix-total">{product.total}</td>
            {product.totalPoints !== undefined ? (
              <td className="campaign-matrix-total">{formatMatrixNumber(product.totalPoints)}</td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CampaignSummaryMatrix({
  title,
  subtitle,
  columns,
  rows,
  summaryRows,
  exportHref,
  shareImage = false,
  imageMatchups
}: CampaignSummaryMatrixProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState("");

  async function shareTableImage() {
    try {
      const blob = await buildMatrixPng({ title, subtitle, columns, rows, imageMatchups });
      const file = new File([blob], "duello-urun-ozetleri.png", { type: "image/png" });

      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title, text: `${title} anlik tablo`, files: [file] });
        setShareMessage("Paylasim menusu acildi.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "duello-urun-ozetleri.png";
      anchor.click();
      URL.revokeObjectURL(url);
      setShareMessage("Gorsel indirildi. Galerinizden WhatsApp ile paylasabilirsiniz.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareMessage(error instanceof Error ? error.message : "Tablo gorseli paylasilamadi.");
    }
  }

  return (
    <section className="live-sale-summary campaign-product-summary" aria-label="Kampanya bazli urun ozetleri">
      <div className="live-sale-summary-head campaign-matrix-head">
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className="campaign-matrix-actions">
          {shareImage ? (
            <button
              className="campaign-matrix-open-button campaign-matrix-share-button"
              onClick={shareTableImage}
              type="button"
            >
              WhatsApp / Paylas
            </button>
          ) : null}
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
      {shareMessage ? <p className="campaign-matrix-share-feedback">{shareMessage}</p> : null}

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
