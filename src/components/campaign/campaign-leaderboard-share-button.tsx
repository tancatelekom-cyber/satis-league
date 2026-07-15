"use client";

import { useState } from "react";

type ShareRow = {
  label: string;
  score: number;
};

type CampaignLeaderboardShareButtonProps = {
  campaignName: string;
  endAt: string;
  participantLabel: string;
  rows: ShareRow[];
  scoring: "points" | "quantity";
};

function fitText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (context.measureText(value).width <= maxWidth) {
    return value;
  }

  let shortened = value;
  while (shortened.length > 1 && context.measureText(`${shortened}...`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }

  return `${shortened}...`;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Gorsel olusturulamadi."));
      }
    }, "image/png");
  });
}

function safeFileName(value: string) {
  return (
    value
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "canli-kampanya"
  );
}

async function createLeaderboardImage({
  campaignName,
  endAt,
  participantLabel,
  rows,
  scoring
}: CampaignLeaderboardShareButtonProps) {
  const width = 1080;
  const rowHeight = 68;
  const headerHeight = 390;
  const footerHeight = 92;
  const height = headerHeight + Math.max(rows.length, 1) * rowHeight + footerHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Gorsel alani olusturulamadi.");
  }

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#064e55");
  background.addColorStop(1, "#071d31");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#ff4f5e";
  context.beginPath();
  context.arc(70, 58, 12, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#ffffff";
  context.font = "900 26px Arial";
  context.fillText("CANLI KAMPANYA", 98, 67);

  context.font = "900 46px Arial";
  context.fillText(fitText(context, campaignName, 940), 60, 137);

  context.fillStyle = "#d9eaf5";
  context.font = "700 23px Arial";
  const endLabel = new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Istanbul"
  }).format(new Date(endAt));
  context.fillText(`Bitis: ${endLabel}`, 60, 180);

  const remainingSeconds = Math.max(
    0,
    Math.floor((new Date(endAt).getTime() - Date.now()) / 1000)
  );
  const countdownValues = [
    { label: "GUN", value: Math.floor(remainingSeconds / 86400) },
    { label: "SAAT", value: Math.floor((remainingSeconds % 86400) / 3600) },
    { label: "DAKIKA", value: Math.floor((remainingSeconds % 3600) / 60) },
    { label: "SANIYE", value: remainingSeconds % 60 }
  ];
  const countdownGap = 12;
  const countdownWidth = (width - 120 - countdownGap * 3) / 4;

  countdownValues.forEach((item, index) => {
    const x = 60 + index * (countdownWidth + countdownGap);
    context.fillStyle = "rgba(255, 225, 142, 0.15)";
    context.fillRect(x, 205, countdownWidth, 88);
    context.fillStyle = "#ffffff";
    context.font = "900 35px Arial";
    context.textAlign = "center";
    context.fillText(String(item.value).padStart(2, "0"), x + countdownWidth / 2, 248);
    context.fillStyle = "#ffe18e";
    context.font = "900 17px Arial";
    context.fillText(item.label, x + countdownWidth / 2, 278);
  });
  context.textAlign = "left";

  context.fillStyle = "rgba(255, 255, 255, 0.1)";
  context.fillRect(40, 322, width - 80, 48);
  context.fillStyle = "#c7dceb";
  context.font = "900 20px Arial";
  context.fillText("SIRA", 62, 354);
  context.fillText(participantLabel.toLocaleUpperCase("tr-TR"), 150, 354);
  context.textAlign = "right";
  context.fillText("SKOR", width - 62, 354);
  context.textAlign = "left";

  if (rows.length === 0) {
    context.fillStyle = "#d9eaf5";
    context.font = "700 25px Arial";
    context.fillText("Henuz siralama verisi yok.", 60, headerHeight + 42);
  }

  rows.forEach((row, index) => {
    const y = headerHeight + index * rowHeight;
    context.fillStyle =
      index < 8
        ? "rgba(62, 126, 214, 0.34)"
        : index % 2 === 0
          ? "rgba(255, 255, 255, 0.07)"
          : "rgba(255, 255, 255, 0.035)";
    context.fillRect(40, y, width - 80, rowHeight - 2);

    context.fillStyle = index < 8 ? "#8fc5ff" : "#8db1c8";
    context.beginPath();
    context.arc(82, y + 33, 21, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#071d31";
    context.font = "900 21px Arial";
    context.textAlign = "center";
    context.fillText(String(index + 1), 82, y + 41);

    context.fillStyle = "#ffffff";
    context.font = "800 26px Arial";
    context.textAlign = "left";
    context.fillText(fitText(context, row.label, 590), 150, y + 42);

    context.fillStyle = "#e5f2fb";
    context.font = "800 24px Arial";
    context.textAlign = "right";
    context.fillText(
      `${row.score.toLocaleString("tr-TR")} ${scoring === "points" ? "puan" : "adet"}`,
      width - 62,
      y + 42
    );
    context.textAlign = "left";
  });

  context.fillStyle = "#9eb8ca";
  context.font = "700 19px Arial";
  context.fillText("Anlik kampanya siralamasi", 60, height - 40);
  context.textAlign = "right";
  context.fillText(new Date().toLocaleString("tr-TR"), width - 60, height - 40);

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

export function CampaignLeaderboardShareButton(props: CampaignLeaderboardShareButtonProps) {
  const [status, setStatus] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);

  async function shareLeaderboard() {
    setIsPreparing(true);
    setStatus("");

    try {
      const blob = await createLeaderboardImage(props);
      const fileName = `${safeFileName(props.campaignName)}-siralama.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      const shareData = {
        files: [file],
        title: props.campaignName,
        text: `${props.campaignName} canli kampanya siralamasi`
      };

      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        setStatus("Paylasim ekrani acildi.");
      } else {
        downloadImage(blob, fileName);
        setStatus("Gorsel indirildi. WhatsApp sohbetine ekleyebilirsiniz.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("");
      } else {
        setStatus(error instanceof Error ? error.message : "Gorsel paylasilamadi.");
      }
    } finally {
      setIsPreparing(false);
    }
  }

  return (
    <div className="campaign-share-area">
      <button
        className="campaign-whatsapp-share-button"
        disabled={isPreparing}
        onClick={shareLeaderboard}
        type="button"
      >
        <span aria-hidden="true">WA</span>
        {isPreparing ? "Gorsel Hazirlaniyor..." : "WhatsApp’ta Resim Paylas"}
      </button>
      {status ? <p className="campaign-share-status">{status}</p> : null}
    </div>
  );
}
