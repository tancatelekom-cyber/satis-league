"use client";

import { useState } from "react";

type ShareCounter = {
  category: string;
  scope: string;
  remaining: number;
};

export function LastDayCounterShareButton({ counters }: { counters: ShareCounter[] }) {
  const [preparing, setPreparing] = useState(false);

  async function share() {
    setPreparing(true);
    try {
      const width = 1200;
      const rowHeight = 150;
      const height = 230 + counters.length * rowHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;

      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#102a43");
      gradient.addColorStop(1, "#0f766e");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#67e8f9";
      context.font = "800 30px Arial";
      context.fillText("TANCA+ • SON GÜN", 70, 65);
      context.fillStyle = "#ffffff";
      context.font = "900 58px Arial";
      context.fillText("Kalanlarımız", 70, 135);

      const cardColors = [
        ["#2563eb", "#1d4ed8"],
        ["#7c3aed", "#c026d3"],
        ["#ea580c", "#f59e0b"],
        ["#0891b2", "#0f766e"]
      ];

      counters.forEach((counter, index) => {
        const y = 190 + index * rowHeight;
        const colors = counter.remaining <= 0 ? ["#15803d", "#16a34a"] : cardColors[index % cardColors.length];
        const cardGradient = context.createLinearGradient(60, y, width - 60, y + 120);
        cardGradient.addColorStop(0, colors[0]);
        cardGradient.addColorStop(1, colors[1]);
        context.fillStyle = cardGradient;
        context.roundRect(60, y, width - 120, 120, 22);
        context.fill();
        context.fillStyle = "#ffffff";
        context.font = "800 32px Arial";
        context.fillText(counter.category, 90, y + 48);
        context.fillStyle = "#cbd5e1";
        context.font = "600 23px Arial";
        context.fillText(counter.scope, 90, y + 88);
        context.textAlign = "right";
        context.fillStyle = counter.remaining <= 0 ? "#4ade80" : "#ffffff";
        context.font = "900 52px Arial";
        context.fillText(counter.remaining <= 0 ? "✓ TAMAMLANDI" : String(counter.remaining), width - 90, y + 74);
        context.textAlign = "left";
      });

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Görsel oluşturulamadı.")), "image/png")
      );
      const file = new File([blob], "son-gun-sayac.png", { type: "image/png" });
      const shareData = { files: [file], title: "Kalanlarımız" };
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        window.open("https://wa.me/?text=Son%20G%C3%BCn%20Saya%C3%A7%20g%C3%B6rseli%20haz%C4%B1rland%C4%B1.", "_blank", "noopener,noreferrer");
      }
    } finally {
      setPreparing(false);
    }
  }

  return (
    <button className="last-day-counter-share" disabled={preparing} onClick={share} type="button">
      {preparing ? "Görsel hazırlanıyor..." : "WhatsApp’ta Paylaş"}
    </button>
  );
}
