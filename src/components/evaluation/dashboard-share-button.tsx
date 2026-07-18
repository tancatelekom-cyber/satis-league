"use client";

import { useState } from "react";

type DashboardShareItem = {
  label: string;
  percent: number;
  detail: string;
};

type DashboardShareButtonProps = {
  title: string;
  subtitle: string;
  items: DashboardShareItem[];
};

function safeFileName(value: string) {
  return (
    value
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "dashboard"
  );
}

function fitText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (context.measureText(value).width <= maxWidth) return value;
  let shortened = value;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawDonut(context: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, percent: number) {
  const normalizedPercent = Math.max(0, Math.min(100, percent));
  const color = normalizedPercent >= 70 ? "#22c55e" : normalizedPercent >= 40 ? "#f59e0b" : "#ef4444";
  context.lineWidth = 36;
  context.lineCap = "butt";
  context.strokeStyle = "#dce7ef";
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = color;
  context.beginPath();
  context.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (normalizedPercent / 100));
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = "800 42px Arial";
  context.textAlign = "center";
  context.fillText(`%${normalizedPercent.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`, centerX, centerY + 14);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Dashboard görseli oluşturulamadı."))), "image/png");
  });
}

async function buildDashboardImage({ title, subtitle, items }: DashboardShareButtonProps) {
  const width = 1600;
  const columns = 3;
  const gap = 28;
  const side = 90;
  const cardWidth = (width - side * 2 - gap * (columns - 1)) / columns;
  const cardHeight = 390;
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const headerHeight = 280;
  const footerHeight = 120;
  const height = headerHeight + rows * cardHeight + Math.max(0, rows - 1) * gap + footerHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Dashboard görsel alanı oluşturulamadı.");

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#17143e");
  background.addColorStop(1, "#0b2143");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#65dce7";
  context.font = "800 30px Arial";
  context.textAlign = "left";
  context.fillText("TANCA+ PERFORMANS DASHBOARDU", side, 72);
  context.fillStyle = "#ffffff";
  context.font = "900 62px Arial";
  context.fillText(fitText(context, title, width - side * 2), side, 150);
  context.fillStyle = "#c8d5ef";
  context.font = "600 31px Arial";
  context.fillText(fitText(context, subtitle, width - side * 2), side, 205);

  items.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = side + column * (cardWidth + gap);
    const y = headerHeight + row * (cardHeight + gap);
    roundedRect(context, x, y, cardWidth, cardHeight, 28);
    context.fillStyle = "#292a55";
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = "rgba(101, 220, 231, 0.25)";
    context.stroke();

    drawDonut(context, x + cardWidth / 2, y + 150, 105, item.percent);
    context.fillStyle = "#ffffff";
    context.font = "800 34px Arial";
    context.textAlign = "center";
    context.fillText(fitText(context, item.label, cardWidth - 52), x + cardWidth / 2, y + 310);
    context.fillStyle = "#b9c9e8";
    context.font = "600 26px Arial";
    context.fillText(fitText(context, item.detail, cardWidth - 52), x + cardWidth / 2, y + 352);
  });

  context.fillStyle = "#8ea4c7";
  context.font = "600 24px Arial";
  context.textAlign = "left";
  context.fillText("Ay sonu hedef gidişatı", side, height - 48);
  context.textAlign = "right";
  context.fillText(new Date().toLocaleString("tr-TR"), width - side, height - 48);
  return canvasToBlob(canvas);
}

function downloadImage(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DashboardShareButton(props: DashboardShareButtonProps) {
  const [isPreparing, setIsPreparing] = useState(false);
  const [status, setStatus] = useState("");

  async function shareDashboard() {
    setIsPreparing(true);
    setStatus("");
    try {
      const blob = await buildDashboardImage(props);
      const fileName = `${safeFileName(props.title)}-dashboard.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      const shareData = { files: [file], title: props.title, text: `${props.title} görsel performans dashboardu` };

      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        setStatus("Paylaşım menüsü açıldı.");
      } else {
        downloadImage(blob, fileName);
        window.open(`https://wa.me/?text=${encodeURIComponent(`${props.title} dashboard görseli indirildi.`)}`, "_blank", "noopener,noreferrer");
        setStatus("Görsel indirildi; WhatsApp açıldı.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("");
      } else {
        setStatus(error instanceof Error ? error.message : "Dashboard görseli paylaşılamadı.");
      }
    } finally {
      setIsPreparing(false);
    }
  }

  return (
    <div className="goal-dashboard-share-area">
      <button className="campaign-whatsapp-share-button" disabled={isPreparing} onClick={shareDashboard} type="button">
        <span aria-hidden="true">WA</span>
        {isPreparing ? "Görsel Hazırlanıyor…" : "WhatsApp’ta Resim Paylaş"}
      </button>
      {status ? <p className="campaign-share-status">{status}</p> : null}
    </div>
  );
}
