"use client";

import { useState } from "react";

type HomeStarRow = {
  seasonName: string;
  winnerName: string;
  score: number;
  monthLabel: string;
};

type HomeLeadersDownloadButtonProps = {
  champion: {
    name: string;
    score: number;
    monthLabel: string;
  };
  starsMonthLabel: string;
  stars: HomeStarRow[];
};

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function fitText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (context.measureText(value).width <= maxWidth) return value;

  let shortened = value;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }

  return `${shortened}…`;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Görsel oluşturulamadı."));
    }, "image/png");
  });
}

function safeFilePart(value: string) {
  return (
    value
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ı/g, "i")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "ayin-yildizlari"
  );
}

async function createHomeLeadersImage({
  champion,
  starsMonthLabel,
  stars
}: HomeLeadersDownloadButtonProps) {
  const width = 1080;
  const padding = 60;
  const championTop = 218;
  const championHeight = 220;
  const starsHeaderTop = championTop + championHeight + 54;
  const rowHeight = 126;
  const rowsTop = starsHeaderTop + 105;
  const footerHeight = 100;
  const visibleRowCount = Math.max(stars.length, 1);
  const height = rowsTop + visibleRowCount * rowHeight + footerHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Görsel alanı oluşturulamadı.");

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#eefbf7");
  background.addColorStop(0.48, "#f8fbff");
  background.addColorStop(1, "#eaf2ff");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width - 120, 80, 10, width - 120, 80, 420);
  glow.addColorStop(0, "rgba(255, 209, 102, 0.34)");
  glow.addColorStop(1, "rgba(255, 209, 102, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, 500);

  context.fillStyle = "#0f766e";
  context.font = "900 22px Arial";
  context.letterSpacing = "2px";
  context.fillText("SATIŞ LİGİ", padding, 68);
  context.letterSpacing = "0px";

  context.fillStyle = "#10203b";
  context.font = "900 52px Arial";
  context.fillText("Ayın Şampiyonu ve Ayın Yıldızları", padding, 142);
  context.fillStyle = "#526680";
  context.font = "700 23px Arial";
  context.fillText("Başarı tablosu", padding, 181);

  const championGradient = context.createLinearGradient(padding, championTop, width - padding, championTop + championHeight);
  championGradient.addColorStop(0, "#7c4a03");
  championGradient.addColorStop(0.55, "#a86b08");
  championGradient.addColorStop(1, "#075f63");
  roundedRect(context, padding, championTop, width - padding * 2, championHeight, 30);
  context.fillStyle = championGradient;
  context.fill();

  roundedRect(context, padding + 30, championTop + 50, 106, 120, 24);
  context.fillStyle = "rgba(255, 255, 255, 0.14)";
  context.fill();
  context.fillStyle = "#fff1a8";
  context.font = "900 30px Arial";
  context.textAlign = "center";
  context.fillText("1", padding + 83, championTop + 91);
  context.font = "40px Arial";
  context.fillText("🏆", padding + 83, championTop + 145);
  context.textAlign = "left";

  const championCopyX = padding + 166;
  context.fillStyle = "#fff1a8";
  context.font = "900 20px Arial";
  context.fillText(`AYIN ŞAMPİYONU · ${champion.monthLabel.toLocaleUpperCase("tr-TR")}`, championCopyX, championTop + 64);
  context.fillStyle = "#ffffff";
  context.font = "900 38px Arial";
  context.fillText(fitText(context, champion.name, 500), championCopyX, championTop + 117);
  context.fillStyle = "rgba(255, 255, 255, 0.76)";
  context.font = "700 21px Arial";
  context.fillText("Üretim Puanı", championCopyX, championTop + 155);

  roundedRect(context, width - padding - 220, championTop + 67, 186, 86, 21);
  context.fillStyle = "rgba(255, 255, 255, 0.14)";
  context.fill();
  context.fillStyle = "#fff1a8";
  context.font = "900 31px Arial";
  context.textAlign = "center";
  context.fillText(`${champion.score.toLocaleString("tr-TR")} puan`, width - padding - 127, championTop + 119);
  context.textAlign = "left";

  roundedRect(context, padding, starsHeaderTop, 190, 40, 20);
  context.fillStyle = "rgba(15, 118, 110, 0.12)";
  context.fill();
  context.fillStyle = "#0f766e";
  context.font = "900 16px Arial";
  context.textAlign = "center";
  context.fillText(`${starsMonthLabel.toLocaleUpperCase("tr-TR")} DÖNEMİ`, padding + 95, starsHeaderTop + 26);
  context.textAlign = "left";
  context.fillStyle = "#10203b";
  context.font = "900 40px Arial";
  context.fillText("Ayın Yıldızları", padding, starsHeaderTop + 91);

  if (stars.length === 0) {
    roundedRect(context, padding, rowsTop, width - padding * 2, rowHeight - 18, 24);
    context.fillStyle = "#075f63";
    context.fill();
    context.fillStyle = "#dbe7f8";
    context.font = "700 25px Arial";
    context.fillText("Henüz ayın yıldızı verisi yok.", padding + 30, rowsTop + 66);
  }

  stars.forEach((star, index) => {
    const y = rowsTop + index * rowHeight;
    const rowGradient = context.createLinearGradient(padding, y, width - padding, y);
    rowGradient.addColorStop(0, "#054f54");
    rowGradient.addColorStop(1, "#076a71");
    roundedRect(context, padding, y, width - padding * 2, rowHeight - 18, 24);
    context.fillStyle = rowGradient;
    context.fill();

    roundedRect(context, padding + 22, y + 19, 70, 70, 18);
    context.fillStyle = "rgba(255, 209, 102, 0.18)";
    context.fill();
    context.fillStyle = "#ffd166";
    context.font = "900 26px Arial";
    context.textAlign = "center";
    context.fillText("1", padding + 57, y + 62);
    context.textAlign = "left";

    const rowCopyX = padding + 118;
    context.fillStyle = "#bff8e6";
    context.font = "800 17px Arial";
    context.fillText(fitText(context, star.seasonName.toLocaleUpperCase("tr-TR"), 520), rowCopyX, y + 38);
    context.fillStyle = "#ffffff";
    context.font = "900 29px Arial";
    context.fillText(fitText(context, star.winnerName, 535), rowCopyX, y + 76);

    roundedRect(context, width - padding - 190, y + 25, 160, 60, 17);
    context.fillStyle = "#ffd166";
    context.fill();
    context.fillStyle = "#045c60";
    context.font = "900 26px Arial";
    context.textAlign = "center";
    context.fillText(star.score.toLocaleString("tr-TR"), width - padding - 110, y + 64);
    context.textAlign = "left";
  });

  context.fillStyle = "#718096";
  context.font = "700 18px Arial";
  context.fillText("Satış Ligi başarı özeti", padding, height - 42);
  context.textAlign = "right";
  context.fillText(
    new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/Istanbul"
    }).format(new Date()),
    width - padding,
    height - 42
  );
  context.textAlign = "left";

  return canvasToBlob(canvas);
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

export function HomeLeadersDownloadButton(props: HomeLeadersDownloadButtonProps) {
  const [isPreparing, setIsPreparing] = useState(false);
  const [status, setStatus] = useState("");

  async function handleDownload() {
    setIsPreparing(true);
    setStatus("");

    try {
      const blob = await createHomeLeadersImage(props);
      const fileName = `ayin-sampiyonu-ve-yildizlari-${safeFilePart(props.starsMonthLabel)}.png`;
      downloadImage(blob, fileName);
      setStatus("Görsel indirildi.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Görsel indirilemedi.");
    } finally {
      setIsPreparing(false);
    }
  }

  const buttonLabel = isPreparing
    ? "Görsel hazırlanıyor"
    : "Ayın şampiyonu ve ayın yıldızlarını görsel olarak indir";

  return (
    <div className="home-leaders-download-wrap">
      <button
        aria-label={buttonLabel}
        className="home-leaders-download-button"
        disabled={isPreparing}
        onClick={handleDownload}
        title={buttonLabel}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
        </svg>
      </button>
      <span aria-live="polite" className="sr-only" role="status">{status}</span>
    </div>
  );
}
