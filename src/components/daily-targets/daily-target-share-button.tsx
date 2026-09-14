"use client";

import { useState } from "react";
import type { DailyTargetGroup } from "@/lib/daily-targets";

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
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
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

async function buildDailyTargetImage({ dateLabel, mode, stores }: DailyTargetShareButtonProps) {
  const width = 1320;
  const padding = 58;
  const rowHeight = 54;
  const categoryHeight = 47;
  const storeHeaderHeight = 82;
  const storeGap = 30;
  const headerHeight = 210;
  const footerHeight = 92;
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
  context.font = "900 23px Arial";
  context.fillText("TANCA+ • GÜNLÜK TAKİP", padding, 58);
  context.fillStyle = "#102a43";
  context.font = "900 49px Arial";
  context.fillText("Günlük Hedef Gerçekleşen", padding, 124);
  context.fillStyle = "#5f738a";
  context.font = "700 24px Arial";
  context.fillText(
    mode === "company" ? `Tüm şubeler ve firma toplamı • ${dateLabel}` : `${stores[0]?.storeName ?? "Şube"} • ${dateLabel}`,
    padding,
    169
  );

  let y = headerHeight;
  const labelX = padding + 24;
  const targetX = 760;
  const actualX = 930;
  const remainingX = 1090;
  const statusX = width - padding - 24;

  for (const store of stores) {
    const storeGradient = context.createLinearGradient(padding, y, width - padding, y + storeHeaderHeight);
    storeGradient.addColorStop(0, store.isCompany ? "#9a4f08" : "#075e63");
    storeGradient.addColorStop(1, store.isCompany ? "#e09222" : "#159399");
    roundedRect(context, padding, y, width - padding * 2, storeHeaderHeight, 22);
    context.fillStyle = storeGradient;
    context.fill();
    context.fillStyle = "rgba(255,255,255,.76)";
    context.font = "800 17px Arial";
    context.fillText(store.isCompany ? "FİRMA GENELİ" : "ŞUBE", labelX, y + 28);
    context.fillStyle = "#ffffff";
    context.font = "900 30px Arial";
    context.fillText(store.storeName, labelX, y + 62);
    y += storeHeaderHeight;

    for (const group of store.groups) {
      context.fillStyle = "#dce9f0";
      context.fillRect(padding, y, width - padding * 2, categoryHeight);
      context.fillStyle = "#18304d";
      context.font = "900 20px Arial";
      context.fillText(fitText(context, group.mainCategory, 570), labelX, y + 30);
      context.textAlign = "right";
      context.fillStyle = "#60738c";
      context.font = "800 15px Arial";
      context.fillText("HEDEF", targetX, y + 29);
      context.fillText("GERÇEKLEŞEN", actualX, y + 29);
      context.fillText("KALAN", remainingX, y + 29);
      context.fillText("DURUM", statusX, y + 29);
      context.textAlign = "left";
      y += categoryHeight;

      group.rows.forEach((row, index) => {
        context.fillStyle = row.entryMode === "summary"
          ? "#fff3d7"
          : index % 2 === 0 ? "#ffffff" : "#f7fafc";
        context.fillRect(padding, y, width - padding * 2, rowHeight);
        context.fillStyle = row.entryMode === "summary" ? "#8b460b" : "#263e58";
        context.font = `${row.entryMode === "summary" ? "900" : "750"} 18px Arial`;
        context.fillText(fitText(context, row.subCategory, 570), labelX, y + 34);
        context.textAlign = "right";
        context.fillStyle = "#304760";
        context.font = "800 18px Arial";
        context.fillText(formatNumber(row.target), targetX, y + 34);
        context.fillText(formatNumber(row.actual), actualX, y + 34);
        context.fillText(formatNumber(row.remaining), remainingX, y + 34);

        if (row.achieved === null) {
          context.fillStyle = "#64748b";
          context.font = "800 15px Arial";
          context.fillText("Kıyas yok", statusX, y + 33);
        } else {
          context.fillStyle = row.achieved ? "#15803d" : "#dc2626";
          context.font = "900 23px Arial";
          context.fillText(row.achieved ? "✓" : "✕", statusX, y + 35);
        }
        context.textAlign = "left";
        y += rowHeight;
      });
    }

    y += storeGap;
  }

  context.fillStyle = "#6f8194";
  context.font = "700 18px Arial";
  context.fillText("TANCA+ günlük hedef özeti", padding, height - 40);
  context.textAlign = "right";
  context.fillText(
    new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/Istanbul"
    }).format(new Date()),
    width - padding,
    height - 40
  );
  context.textAlign = "left";

  return canvasToBlob(canvas);
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
