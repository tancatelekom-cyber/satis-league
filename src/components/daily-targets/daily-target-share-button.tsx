"use client";

import { useEffect, useState } from "react";
import { buildDailyTargetRowKey, type DailyTargetGroup, type DailyTargetViewRow } from "@/lib/daily-targets";

export type DailyTargetShareStore = {
  storeName: string;
  groups: DailyTargetGroup[];
  isCompany?: boolean;
};

type DailyTargetShareButtonProps = {
  dateLabel: string;
  mode: "store" | "company";
  stores: DailyTargetShareStore[];
};

function formatNumber(value: number | null) {
  if (value === null) return "-";
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function fitText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (context.measureText(value).width <= maxWidth) return value;
  let text = value;
  while (text.length > 1 && context.measureText(`${text}…`).width > maxWidth) {
    text = text.slice(0, -1);
  }
  return `${text}…`;
}

function drawCenteredFullText(
  context: CanvasRenderingContext2D,
  value: string,
  centerX: number,
  baselineY: number,
  maxWidth: number,
  maximumSize: number,
  minimumSize: number,
  weight = 900
) {
  let fontSize = maximumSize;
  context.font = `${weight} ${fontSize}px Arial`;

  while (fontSize > minimumSize && context.measureText(value).width > maxWidth) {
    fontSize -= 1;
    context.font = `${weight} ${fontSize}px Arial`;
  }

  context.fillText(value, centerX, baselineY);
}

function safeFilePart(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Paylaşım görseli oluşturulamadı."));
    }, "image/png");
  });
}

function downloadImage(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function findStoreRow(
  store: DailyTargetShareStore,
  mainCategory: string,
  subCategory: string
): DailyTargetViewRow | null {
  const rowKey = buildDailyTargetRowKey(mainCategory, subCategory);

  for (const group of store.groups) {
    const row = group.rows.find(
      (item) => buildDailyTargetRowKey(item.mainCategory, item.subCategory) === rowKey
    );
    if (row) return row;
  }

  return null;
}

function summarizeStore(store: DailyTargetShareStore) {
  const targetedRows = store.groups.flatMap((group) => group.rows).filter((row) => row.target !== null);
  const achievedCount = targetedRows.filter((row) => row.achieved).length;

  return {
    achievedCount,
    targetedCount: targetedRows.length,
    percent: targetedRows.length ? Math.round((achievedCount / targetedRows.length) * 100) : 0
  };
}

async function buildCompanySummaryImage({ dateLabel, stores }: DailyTargetShareButtonProps) {
  const branchStores = stores.filter((store) => !store.isCompany);
  const companyStore = stores.find((store) => store.isCompany) ?? null;
  const columns = companyStore ? [...branchStores, companyStore] : branchStores;
  const sourceGroups = companyStore?.groups ?? branchStores[0]?.groups ?? [];
  const padding = 54;
  const categoryWidth = 390;
  const storeWidth = 238;
  const headerHeight = 205;
  const columnHeaderHeight = 105;
  const groupHeaderHeight = 54;
  const rowHeight = 82;
  const summaryHeight = 100;
  const footerHeight = 90;
  const tableWidth = categoryWidth + columns.length * storeWidth;
  const rowCount = sourceGroups.reduce((total, group) => total + group.rows.length, 0);
  const height = headerHeight
    + columnHeaderHeight
    + sourceGroups.length * groupHeaderHeight
    + rowCount * rowHeight
    + summaryHeight
    + footerHeight;
  const width = padding * 2 + tableWidth;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Görsel alanı oluşturulamadı.");

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#ecfdf8");
  background.addColorStop(0.52, "#f8fbff");
  background.addColorStop(1, "#eef4fb");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#0f766e";
  context.font = "900 24px Arial";
  context.fillText("TANCA+ • GÜNLÜK TAKİP", padding, 56);
  context.fillStyle = "#102a43";
  context.font = "900 50px Arial";
  context.fillText("Günlük Hedef Özeti", padding, 120);
  context.fillStyle = "#5f738a";
  context.font = "700 25px Arial";
  context.fillText(`Şube bazlı özet tablo • ${dateLabel}`, padding, 164);

  let y = headerHeight;
  const tableX = padding;

  context.fillStyle = "#18304d";
  context.fillRect(tableX, y, categoryWidth, columnHeaderHeight);
  context.fillStyle = "#ffffff";
  context.font = "900 23px Arial";
  context.fillText("KATEGORİ", tableX + 24, y + 60);

  columns.forEach((store, index) => {
    const x = tableX + categoryWidth + index * storeWidth;
    context.fillStyle = store.isCompany ? "#b86612" : "#08747a";
    context.fillRect(x, y, storeWidth, columnHeaderHeight);
    context.strokeStyle = "rgba(255,255,255,.24)";
    context.lineWidth = 2;
    context.strokeRect(x, y, storeWidth, columnHeaderHeight);
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.font = "900 22px Arial";
    context.fillText(fitText(context, store.storeName, storeWidth - 24), x + storeWidth / 2, y + 43);
    context.fillStyle = "rgba(255,255,255,.82)";
    context.font = "900 20px Arial";
    context.fillText("H / G", x + storeWidth / 2, y + 76);
  });
  context.textAlign = "left";
  y += columnHeaderHeight;

  sourceGroups.forEach((group) => {
    context.fillStyle = "#dce9f0";
    context.fillRect(tableX, y, tableWidth, groupHeaderHeight);
    context.strokeStyle = "#c4d4df";
    context.lineWidth = 2;
    context.strokeRect(tableX, y, tableWidth, groupHeaderHeight);
    context.fillStyle = "#18304d";
    context.font = "900 21px Arial";
    context.fillText(fitText(context, group.mainCategory, tableWidth - 48), tableX + 22, y + 35);
    y += groupHeaderHeight;

    group.rows.forEach((sourceRow, rowIndex) => {
      const rowFill = sourceRow.entryMode === "summary"
        ? "#fff4d8"
        : rowIndex % 2 === 0 ? "#ffffff" : "#f7fafc";
      context.fillStyle = rowFill;
      context.fillRect(tableX, y, categoryWidth, rowHeight);
      context.strokeStyle = "#d8e2ea";
      context.lineWidth = 2;
      context.strokeRect(tableX, y, categoryWidth, rowHeight);
      context.fillStyle = sourceRow.entryMode === "summary" ? "#8b460b" : "#263e58";
      context.font = `${sourceRow.entryMode === "summary" ? "900" : "800"} 21px Arial`;
      context.fillText(fitText(context, sourceRow.subCategory, categoryWidth - 42), tableX + 22, y + 49);

      columns.forEach((store, columnIndex) => {
        const x = tableX + categoryWidth + columnIndex * storeWidth;
        const row = findStoreRow(store, sourceRow.mainCategory, sourceRow.subCategory);
        const target = row?.target ?? null;
        const actual = row?.actual ?? 0;
        const achieved = row?.achieved ?? null;

        context.fillStyle = target === null
          ? "#f1f5f9"
          : achieved ? "#e6f8eb" : "#fff0f0";
        if (store.isCompany) {
          context.fillStyle = target === null
            ? "#fff7e8"
            : achieved ? "#dcf5e3" : "#ffe8e1";
        }
        context.fillRect(x, y, storeWidth, rowHeight);
        context.strokeStyle = store.isCompany ? "#e2b978" : "#d8e2ea";
        context.strokeRect(x, y, storeWidth, rowHeight);

        context.textAlign = "center";
        context.fillStyle = achieved === true ? "#147a39" : achieved === false ? "#c62828" : "#475569";
        context.font = "900 25px Arial";
        const valueText = target === null
          ? formatNumber(actual)
          : `${formatNumber(target)} / ${formatNumber(actual)}`;
        drawCenteredFullText(context, valueText, x + storeWidth / 2, y + 38, storeWidth - 20, 25, 13);
        context.font = "800 15px Arial";
        context.fillText(
          target === null ? "HEDEF YOK" : achieved ? "✓ TAMAM" : `K: ${formatNumber(row?.remaining ?? 0)}`,
          x + storeWidth / 2,
          y + 64
        );
      });
      context.textAlign = "left";
      y += rowHeight;
    });
  });

  context.fillStyle = "#18304d";
  context.fillRect(tableX, y, categoryWidth, summaryHeight);
  context.fillStyle = "#ffffff";
  context.font = "900 22px Arial";
  context.fillText("TAMAMLANAN HEDEFLER", tableX + 22, y + 58);

  columns.forEach((store, index) => {
    const x = tableX + categoryWidth + index * storeWidth;
    const summary = summarizeStore(store);
    context.fillStyle = store.isCompany ? "#fff0d9" : "#e7f5f5";
    context.fillRect(x, y, storeWidth, summaryHeight);
    context.strokeStyle = store.isCompany ? "#e2b978" : "#c5dddd";
    context.strokeRect(x, y, storeWidth, summaryHeight);
    context.textAlign = "center";
    context.fillStyle = store.isCompany ? "#9a4f08" : "#075e63";
    context.font = "900 28px Arial";
    context.fillText(`${summary.achievedCount}/${summary.targetedCount}`, x + storeWidth / 2, y + 43);
    context.font = "900 18px Arial";
    context.fillText(`%${summary.percent} TAMAMLANDI`, x + storeWidth / 2, y + 73);
  });
  context.textAlign = "left";

  context.fillStyle = "#6f8194";
  context.font = "700 18px Arial";
  context.fillText("H: Hedef • G: Gerçekleşen • K: Kalan", padding, height - 38);
  context.textAlign = "right";
  context.fillText(
    new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/Istanbul"
    }).format(new Date()),
    width - padding,
    height - 38
  );
  context.textAlign = "left";

  return canvasToBlob(canvas);
}

async function buildDailyTargetImage({ dateLabel, mode, stores }: DailyTargetShareButtonProps) {
  if (mode === "company") {
    return buildCompanySummaryImage({ dateLabel, mode, stores });
  }

  const width = 900;
  const padding = 34;
  const rowHeight = 72;
  const categoryHeight = 58;
  const storeHeaderHeight = 94;
  const storeGap = 24;
  const headerHeight = 190;
  const footerHeight = 78;
  const contentHeight = stores.reduce(
    (total, store) => total + storeHeaderHeight + storeGap + store.groups.reduce(
      (groupTotal, group) => groupTotal + categoryHeight + group.rows.length * rowHeight,
      0
    ),
    0
  );
  const height = headerHeight + contentHeight + footerHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Görsel alanı oluşturulamadı.");

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#eefaf7");
  background.addColorStop(0.5, "#f7fbff");
  background.addColorStop(1, "#edf4fb");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#0f766e";
  context.font = "900 24px Arial";
  context.fillText("TANCA+ • GÜNLÜK TAKİP", padding, 48);
  context.fillStyle = "#102a43";
  context.font = "900 43px Arial";
  context.fillText("Günlük Hedef Gerçekleşen", padding, 105);
  context.fillStyle = "#5f738a";
  context.font = "700 24px Arial";
  context.fillText(
    `${stores[0]?.storeName ?? "Şube"} • ${dateLabel}`,
    padding,
    151
  );

  let y = headerHeight;
  const labelX = padding + 20;
  const targetX = 535;
  const actualX = 655;
  const remainingX = 770;
  const statusX = width - padding - 18;

  for (const store of stores) {
    const storeGradient = context.createLinearGradient(padding, y, width - padding, y + storeHeaderHeight);
    storeGradient.addColorStop(0, store.isCompany ? "#9a4f08" : "#075e63");
    storeGradient.addColorStop(1, store.isCompany ? "#e09222" : "#159399");
    roundedRect(context, padding, y, width - padding * 2, storeHeaderHeight, 22);
    context.fillStyle = storeGradient;
    context.fill();
    context.fillStyle = "rgba(255,255,255,.76)";
    context.font = "800 19px Arial";
    context.fillText(store.isCompany ? "FİRMA GENELİ" : "ŞUBE", labelX, y + 31);
    context.fillStyle = "#ffffff";
    context.font = "900 35px Arial";
    context.fillText(store.storeName, labelX, y + 71);
    y += storeHeaderHeight;

    for (const group of store.groups) {
      context.fillStyle = "#dce9f0";
      context.fillRect(padding, y, width - padding * 2, categoryHeight);
      context.fillStyle = "#18304d";
      context.font = "900 24px Arial";
      context.fillText(fitText(context, group.mainCategory, 425), labelX, y + 38);
      context.textAlign = "right";
      context.fillStyle = "#60738c";
      context.font = "900 20px Arial";
      context.fillText("H", targetX, y + 37);
      context.fillText("G", actualX, y + 37);
      context.fillText("K", remainingX, y + 37);
      context.fillText("DURUM", statusX, y + 37);
      context.textAlign = "left";
      y += categoryHeight;

      group.rows.forEach((row, index) => {
        context.fillStyle = row.entryMode === "summary"
          ? "#fff3d7"
          : index % 2 === 0 ? "#ffffff" : "#f7fafc";
        context.fillRect(padding, y, width - padding * 2, rowHeight);
        context.fillStyle = row.entryMode === "summary" ? "#8b460b" : "#263e58";
        context.font = `${row.entryMode === "summary" ? "900" : "800"} 24px Arial`;
        context.fillText(fitText(context, row.subCategory, 425), labelX, y + 45);
        context.textAlign = "right";
        context.fillStyle = "#304760";
        context.font = "900 25px Arial";
        context.fillText(formatNumber(row.target), targetX, y + 45);
        context.fillText(formatNumber(row.actual), actualX, y + 45);
        context.fillText(formatNumber(row.remaining), remainingX, y + 45);

        if (row.achieved === null) {
          context.fillStyle = "#64748b";
          context.font = "800 16px Arial";
          context.fillText("Kıyas yok", statusX, y + 44);
        } else {
          context.fillStyle = row.achieved ? "#15803d" : "#dc2626";
          context.font = "900 32px Arial";
          context.fillText(row.achieved ? "✓" : "✕", statusX, y + 49);
        }
        context.textAlign = "left";
        y += rowHeight;
      });
    }

    y += storeGap;
  }

  context.fillStyle = "#6f8194";
  context.font = "700 18px Arial";
  context.fillText("H: Hedef • G: Gerçekleşen • K: Kalan", padding, height - 31);
  context.textAlign = "right";
  context.fillText(
    new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/Istanbul"
    }).format(new Date()),
    width - padding,
    height - 31
  );
  context.textAlign = "left";

  return canvasToBlob(canvas);
}

export function DailyTargetSharePreview(props: DailyTargetShareButtonProps) {
  const { dateLabel, mode, stores } = props;
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setImageUrl("");
    setError("");

    void buildDailyTargetImage({ dateLabel, mode, stores }).then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      if (active) {
        setImageUrl(objectUrl);
      } else {
        URL.revokeObjectURL(objectUrl);
      }
    }).catch((previewError) => {
      if (active) {
        setError(previewError instanceof Error ? previewError.message : "Özet görseli hazırlanamadı.");
      }
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [dateLabel, mode, stores]);

  return (
    <section className="daily-target-share-preview">
      <div className="daily-target-share-preview-head">
        <div>
          <span>WHATSAPP ÖZET GÖRSELİ</span>
          <h2>{mode === "company" ? "Firma özeti" : `${stores[0]?.storeName ?? "Şube"} özeti`}</h2>
        </div>
        <small>Görsele dokunarak tam boy açabilirsiniz.</small>
      </div>
      {imageUrl ? (
        <a
          className={`daily-target-share-preview-image ${mode === "company" ? "daily-target-share-preview-company" : ""}`}
          href={imageUrl}
          rel="noreferrer"
          target="_blank"
        >
          {/* Canvas tarafından üretilen geçici önizleme olduğu için normal img kullanılıyor. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={mode === "company" ? "Firma günlük hedef WhatsApp özet görseli" : "Şube günlük hedef WhatsApp özet görseli"}
            src={imageUrl}
          />
        </a>
      ) : error ? (
        <div className="message-box error-box">{error}</div>
      ) : (
        <div className="daily-target-share-preview-loading">Özet görseli hazırlanıyor…</div>
      )}
    </section>
  );
}

export function DailyTargetShareButton(props: DailyTargetShareButtonProps) {
  const [preparing, setPreparing] = useState(false);
  const [status, setStatus] = useState("");

  async function share() {
    setPreparing(true);
    setStatus("");

    try {
      const blob = await buildDailyTargetImage(props);
      const scope = props.mode === "company" ? "firma" : safeFilePart(props.stores[0]?.storeName ?? "sube");
      const file = new File([blob], `gunluk-hedefler-${scope}.png`, { type: "image/png" });
      const shareData = {
        files: [file],
        title: "Günlük Hedef Gerçekleşen",
        text: `${props.dateLabel} günlük hedef gerçekleşen tablosu`
      };

      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        setStatus("Paylaşım ekranı açıldı.");
      } else {
        downloadImage(blob, file.name);
        window.open(
          `https://wa.me/?text=${encodeURIComponent(`${props.dateLabel} günlük hedef gerçekleşen görseli hazırlandı.`)}`,
          "_blank",
          "noopener,noreferrer"
        );
        setStatus("Görsel indirildi; WhatsApp açıldı.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Görsel paylaşılamadı.");
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="daily-target-share-wrap">
      <button className="daily-target-share-button" disabled={preparing} onClick={share} type="button">
        <span aria-hidden="true">↗</span>
        {preparing ? "Görsel hazırlanıyor…" : "WhatsApp’ta Resim Paylaş"}
      </button>
      {status ? <span aria-live="polite" className="daily-target-share-status">{status}</span> : null}
    </div>
  );
}
