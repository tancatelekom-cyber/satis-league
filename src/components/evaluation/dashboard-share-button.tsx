"use client";

import { useState } from "react";
import { getDashboardPalette } from "@/lib/dashboard-colors";

type DashboardShareItem = {
  label: string;
  percent: number;
  detail: string;
  colorMode?: "success" | "category";
};

type DashboardShareStatusItem = {
  label: string;
  count: number;
  tone: "success" | "near" | "risk";
};

type DashboardShareButtonProps = {
  title: string;
  subtitle: string;
  items: DashboardShareItem[];
  statusItems?: DashboardShareStatusItem[];
  rankingItems?: DashboardShareItem[];
  detailDivider?: {
    beforeIndex: number;
    title: string;
  };
  detailColumns?: 2 | 3;
  detailColorMode?: "success" | "category";
  colorBlindMode?: boolean;
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

function drawDonut(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  percent: number,
  lineWidth = 24,
  fontSize = 29,
  colorMode: "success" | "category" = "category",
  colorBlindMode = false
) {
  const normalizedPercent = Math.max(0, Math.min(100, percent));
  const palette = getDashboardPalette(colorBlindMode);
  const color = colorMode === "success"
    ? normalizedPercent >= 80
      ? palette.success
      : normalizedPercent >= 60
        ? palette.near
        : palette.risk
    : normalizedPercent >= 100
      ? palette.success
      : normalizedPercent >= 80
        ? palette.near
        : palette.risk;
  context.lineWidth = lineWidth;
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
  context.font = `800 ${fontSize}px Arial`;
  context.textAlign = "center";
  context.fillText(
    `%${percent.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`,
    centerX,
    centerY + fontSize * 0.34
  );
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Dashboard görseli oluşturulamadı."))), "image/png");
  });
}

function concatBytes(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

async function canvasToPdfBlob(canvas: HTMLCanvasElement) {
  const encoder = new TextEncoder();
  const pageWidth = 595.28;
  const pageHeight = pageWidth * (canvas.height / canvas.width);
  const sourcePageHeight = canvas.height;
  const images: Array<{ bytes: Uint8Array; width: number; height: number; renderedHeight: number }> = [];

  for (let sourceY = 0; sourceY < canvas.height; sourceY += sourcePageHeight) {
    const sliceHeight = Math.min(sourcePageHeight, canvas.height - sourceY);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const context = slice.getContext("2d");
    if (!context) throw new Error("PDF sayfası oluşturulamadı.");
    context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
    const jpeg = await new Promise<Blob>((resolve, reject) => {
      slice.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PDF görseli oluşturulamadı."))),
        "image/jpeg",
        0.94
      );
    });
    images.push({
      bytes: new Uint8Array(await jpeg.arrayBuffer()),
      width: slice.width,
      height: slice.height,
      renderedHeight: pageWidth * (sliceHeight / canvas.width)
    });
  }

  const objectCount = 2 + images.length * 3;
  const objects: Uint8Array[] = new Array(objectCount + 1);
  objects[1] = encoder.encode("<< /Type /Catalog /Pages 2 0 R >>");
  objects[2] = encoder.encode(
    `<< /Type /Pages /Kids [${images.map((_, index) => `${3 + index * 3} 0 R`).join(" ")}] /Count ${images.length} >>`
  );
  images.forEach((image, index) => {
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const imageName = `Im${index + 1}`;
    const content = `q\n${pageWidth.toFixed(2)} 0 0 ${image.renderedHeight.toFixed(2)} 0 ${(pageHeight - image.renderedHeight).toFixed(2)} cm\n/${imageName} Do\nQ`;
    objects[pageId] = encoder.encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /${imageName} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    objects[contentId] = encoder.encode(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
    objects[imageId] = concatBytes([
      encoder.encode(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`
      ),
      image.bytes,
      encoder.encode("\nendstream")
    ]);
  });

  const chunks: Uint8Array[] = [encoder.encode("%PDF-1.4\n")];
  const offsets = new Array(objectCount + 1).fill(0);
  let byteOffset = chunks[0].length;
  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    offsets[objectId] = byteOffset;
    const chunk = concatBytes([
      encoder.encode(`${objectId} 0 obj\n`),
      objects[objectId],
      encoder.encode("\nendobj\n")
    ]);
    chunks.push(chunk);
    byteOffset += chunk.length;
  }
  const xrefOffset = byteOffset;
  chunks.push(
    encoder.encode(
      `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
        .join("")}trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
    )
  );
  return new Blob([concatBytes(chunks)], { type: "application/pdf" });
}

async function buildDashboardImage({
  title,
  subtitle,
  items,
  statusItems = [],
  rankingItems = [],
  detailDivider,
  detailColumns = 3,
  detailColorMode = "category",
  colorBlindMode = false
}: DashboardShareButtonProps) {
  const width = 1600;
  const columns = detailColumns;
  const gap = 28;
  const side = 90;
  const cardWidth = (width - side * 2 - gap * (columns - 1)) / columns;
  const featuredHeight = 560;
  const cardHeight = columns === 2 ? 330 : 290;
  const detailItems = items.slice(1);
  const dividerIndex = detailDivider
    ? Math.max(0, Math.min(detailItems.length, detailDivider.beforeIndex))
    : detailItems.length;
  const firstDetailRows = Math.ceil(dividerIndex / columns);
  const secondDetailRows = detailDivider
    ? Math.ceil((detailItems.length - dividerIndex) / columns)
    : 0;
  const detailRows = firstDetailRows + secondDetailRows;
  const dividerHeight = detailDivider && detailItems.length > dividerIndex ? 105 : 0;
  const headerHeight = 280;
  const footerHeight = 120;
  const statusHeight = statusItems.length ? 270 : 0;
  const statusBlockHeight = statusHeight ? gap + statusHeight : 0;
  const detailHeight = detailRows > 0
    ? gap +
      detailRows * cardHeight +
      Math.max(0, firstDetailRows - 1) * gap +
      Math.max(0, secondDetailRows - 1) * gap +
      (dividerHeight ? gap + dividerHeight + gap : 0)
    : 0;
  const rankingHeaderHeight = rankingItems.length ? 105 : 0;
  const rankingRowHeight = 76;
  const rankingHeight = rankingItems.length
    ? gap + rankingHeaderHeight + rankingItems.length * rankingRowHeight
    : 0;
  const height = headerHeight + featuredHeight + statusBlockHeight + detailHeight + rankingHeight + footerHeight;
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

  const featuredItem = items[0];
  if (featuredItem) {
    const featuredY = headerHeight;
    const featuredWidth = width - side * 2;
    roundedRect(context, side, featuredY, featuredWidth, featuredHeight, 36);
    context.fillStyle = "#292a55";
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = "rgba(101, 220, 231, 0.42)";
    context.stroke();

    drawDonut(context, width / 2, featuredY + 225, 165, featuredItem.percent, 52, 64, "success", colorBlindMode);
    context.fillStyle = "#ffffff";
    context.font = "900 50px Arial";
    context.textAlign = "center";
    context.fillText(fitText(context, featuredItem.label, featuredWidth - 100), width / 2, featuredY + 458);
    context.fillStyle = "#b9c9e8";
    context.font = "600 31px Arial";
    context.fillText(fitText(context, featuredItem.detail, featuredWidth - 100), width / 2, featuredY + 510);
  }

  const statusY = headerHeight + featuredHeight + gap;
  if (statusItems.length) {
    const statusTotal = Math.max(1, statusItems.reduce((total, item) => total + item.count, 0));
    const palette = getDashboardPalette(colorBlindMode);
    roundedRect(context, side, statusY, width - side * 2, statusHeight, 28);
    context.fillStyle = "#292a55";
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = "rgba(101, 220, 231, 0.25)";
    context.stroke();

    context.fillStyle = "#ffffff";
    context.font = "900 36px Arial";
    context.textAlign = "left";
    context.fillText("Hedef Durumu Dağılımı", side + 42, statusY + 58);

    const barX = side + 42;
    const barY = statusY + 92;
    const barWidth = width - side * 2 - 84;
    const barHeight = 52;
    let currentX = barX;
    statusItems.forEach((item) => {
      const segmentWidth = barWidth * (item.count / statusTotal);
      context.fillStyle = palette[item.tone];
      context.fillRect(currentX, barY, segmentWidth, barHeight);
      currentX += segmentWidth;
    });

    statusItems.forEach((item, index) => {
      const legendX = side + 42 + index * ((width - side * 2 - 84) / Math.max(1, statusItems.length));
      context.fillStyle = palette[item.tone];
      context.beginPath();
      context.arc(legendX + 10, statusY + 198, 10, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = "800 27px Arial";
      context.fillText(`${item.label}: ${item.count}`, legendX + 32, statusY + 207);
    });
  }

  const detailStartY = headerHeight + featuredHeight + statusBlockHeight;
  const firstDetailHeight = firstDetailRows
    ? firstDetailRows * cardHeight + Math.max(0, firstDetailRows - 1) * gap
    : 0;
  const secondDetailStartY = detailStartY + gap + firstDetailHeight + (dividerHeight ? gap + dividerHeight + gap : 0);

  if (dividerHeight && detailDivider) {
    const dividerY = detailStartY + gap + firstDetailHeight + gap;
    context.strokeStyle = "rgba(101, 220, 231, 0.78)";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(side, dividerY + 45);
    context.lineTo(width - side, dividerY + 45);
    context.stroke();
    const titleWidth = Math.min(650, context.measureText(detailDivider.title).width + 90);
    roundedRect(context, width / 2 - titleWidth / 2, dividerY + 10, titleWidth, 70, 35);
    context.fillStyle = "#292a55";
    context.fill();
    context.strokeStyle = "rgba(101, 220, 231, 0.78)";
    context.stroke();
    context.fillStyle = "#ffffff";
    context.font = "900 31px Arial";
    context.textAlign = "center";
    context.fillText(detailDivider.title, width / 2, dividerY + 56);
  }

  detailItems.forEach((item, index) => {
    const isSecondGroup = Boolean(dividerHeight) && index >= dividerIndex;
    const groupIndex = isSecondGroup ? index - dividerIndex : index;
    const column = groupIndex % columns;
    const row = Math.floor(groupIndex / columns);
    const x = side + column * (cardWidth + gap);
    const y = (isSecondGroup ? secondDetailStartY : detailStartY + gap) + row * (cardHeight + gap);
    roundedRect(context, x, y, cardWidth, cardHeight, 22);
    context.fillStyle = "#292a55";
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = "rgba(101, 220, 231, 0.25)";
    context.stroke();

    const donutRadius = columns === 2 ? 86 : 70;
    const donutCenterY = columns === 2 ? y + 125 : y + 105;
    drawDonut(
      context,
      x + cardWidth / 2,
      donutCenterY,
      donutRadius,
      item.percent,
      columns === 2 ? 28 : 24,
      columns === 2 ? 34 : 29,
      item.colorMode ?? detailColorMode,
      colorBlindMode
    );
    context.fillStyle = "#ffffff";
    context.font = `800 ${columns === 2 ? 30 : 25}px Arial`;
    context.textAlign = "center";
    context.fillText(fitText(context, item.label, cardWidth - 42), x + cardWidth / 2, y + (columns === 2 ? 265 : 225));
    context.fillStyle = "#b9c9e8";
    context.font = `600 ${columns === 2 ? 22 : 19}px Arial`;
    context.fillText(fitText(context, item.detail, cardWidth - 42), x + cardWidth / 2, y + (columns === 2 ? 302 : 258));
  });

  if (rankingItems.length) {
    const rankingY = detailStartY + detailHeight + gap;
    context.fillStyle = "#ffffff";
    context.font = "900 38px Arial";
    context.textAlign = "left";
    context.fillText("Personel Başarı Sıralaması", side, rankingY + 48);
    context.fillStyle = "#b9c9e8";
    context.font = "600 23px Arial";
    context.fillText("En yüksek başarı oranından en düşüğe", side, rankingY + 82);

    const palette = getDashboardPalette(colorBlindMode);
    rankingItems.forEach((item, index) => {
      const rowY = rankingY + rankingHeaderHeight + index * rankingRowHeight;
      const labelWidth = 360;
      const barX = side + labelWidth;
      const barWidth = width - side * 2 - labelWidth;
      const normalizedPercent = Math.max(0, Math.min(100, item.percent));
      const color = normalizedPercent >= 80
        ? palette.success
        : normalizedPercent >= 60
          ? palette.near
          : palette.risk;

      context.fillStyle = "#ffffff";
      context.font = "800 25px Arial";
      context.textAlign = "left";
      context.fillText(fitText(context, item.label, labelWidth - 24), side, rowY + 36);
      context.fillStyle = "#b9c9e8";
      context.font = "600 18px Arial";
      context.fillText(fitText(context, item.detail, labelWidth - 24), side, rowY + 61);

      roundedRect(context, barX, rowY + 13, barWidth, 48, 24);
      context.fillStyle = "#dce7ef";
      context.fill();
      const fillWidth = Math.max(4, barWidth * (normalizedPercent / 100));
      roundedRect(context, barX, rowY + 13, fillWidth, 48, 24);
      context.fillStyle = color;
      context.fill();
      context.fillStyle = "#17143e";
      context.font = "900 23px Arial";
      context.textAlign = "center";
      context.fillText(
        `%${item.percent.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`,
        barX + barWidth / 2,
        rowY + 46
      );
    });
  }

  context.fillStyle = "#8ea4c7";
  context.font = "600 24px Arial";
  context.textAlign = "left";
  context.fillText("Ay sonu hedef gidişatı", side, height - 48);
  context.textAlign = "right";
  context.fillText(new Date().toLocaleString("tr-TR"), width - side, height - 48);
  return canvas;
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
      const canvas = await buildDashboardImage(props);
      const blob = await canvasToBlob(canvas);
      const fileName = `${safeFileName(props.title)}-dashboard.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      const shareData = { files: [file], title: props.title, text: props.title };

      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        setStatus("Paylaşım menüsü açıldı.");
      } else {
        downloadImage(blob, fileName);
        window.open(`https://wa.me/?text=${encodeURIComponent(`${props.title} görseli indirildi.`)}`, "_blank", "noopener,noreferrer");
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

  async function downloadOrShareDashboardPdf() {
    setIsPreparing(true);
    setStatus("");
    try {
      const canvas = await buildDashboardImage(props);
      const pdfBlob = await canvasToPdfBlob(canvas);
      const fileName = `${safeFileName(props.title)}-dashboard.pdf`;
      const file = new File([pdfBlob], fileName, { type: "application/pdf" });
      const shareData = { files: [file], title: props.title, text: `${props.title} PDF` };
      const isMobileDevice =
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (window.matchMedia("(pointer: coarse)").matches && window.innerWidth <= 1024);

      if (isMobileDevice && navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        setStatus("PDF paylaşım menüsü açıldı.");
      } else {
        downloadImage(pdfBlob, fileName);
        setStatus("Dashboard PDF olarak indirildi.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("");
      } else {
        setStatus(error instanceof Error ? error.message : "Dashboard PDF olarak hazırlanamadı.");
      }
    } finally {
      setIsPreparing(false);
    }
  }

  return (
    <div className="goal-dashboard-share-area">
      <div className="goal-dashboard-share-actions">
      <button className="campaign-whatsapp-share-button" disabled={isPreparing} onClick={shareDashboard} type="button">
        <span aria-hidden="true">WA</span>
        {isPreparing ? "Görsel Hazırlanıyor…" : "WhatsApp’ta Resim Paylaş"}
      </button>
        <button
          className="goal-dashboard-pdf-download-button"
          disabled={isPreparing}
          onClick={downloadOrShareDashboardPdf}
          type="button"
        >
          PDF İndir<span className="goal-dashboard-pdf-mobile-label"> / Paylaş</span>
        </button>
      </div>
      {status ? <p className="campaign-share-status">{status}</p> : null}
    </div>
  );
}
