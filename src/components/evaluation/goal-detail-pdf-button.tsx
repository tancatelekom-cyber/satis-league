"use client";

import { useState } from "react";

type GoalDetailPdfButtonProps = {
  scopeLabel: string;
};

function concatBytes(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function buildGoalPdfCanvas(page: HTMLElement, scopeLabel: string) {
  const width = 1600;
  const side = 70;
  const pageSliceHeight = Math.floor(width * (595 / 842));
  type PdfBlock =
    | { text: string; kind: "title" | "heading" | "spacer" }
    | {
        cells: Array<{ text: string; span: number }>;
        columnCount: number;
        header: boolean;
        rowIndex: number;
        kind: "tableRow";
      };
  const blocks: PdfBlock[] = [
    { text: `${scopeLabel} Hedef Gerçekleşen`, kind: "title" }
  ];

  page.querySelectorAll<HTMLElement>("h1, h2, h3, h4, details > summary, table").forEach((element) => {
    if (element instanceof HTMLTableElement) {
      const rows = Array.from(element.querySelectorAll<HTMLTableRowElement>("tr")).map((row) => {
        const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("th, td")).map((cell) => ({
          text: (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
          span: Math.max(1, cell.colSpan || 1)
        }));
        return { cells, header: Boolean(row.querySelector("th")) };
      });
      const columnCount = Math.max(
        1,
        ...rows.map((row) => row.cells.reduce((total, cell) => total + cell.span, 0))
      );
      rows.forEach((row, rowIndex) => {
        if (row.cells.some((cell) => Boolean(cell.text))) {
          blocks.push({ cells: row.cells, columnCount, header: row.header, rowIndex, kind: "tableRow" });
        }
      });
      blocks.push({ text: "", kind: "spacer" });
      return;
    }

    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) blocks.push({ text, kind: element.tagName === "H1" ? "title" : "heading" });
  });

  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) throw new Error("PDF içeriği hazırlanamadı.");

  let estimatedHeight = 130;
  blocks.forEach((block) => {
    if (block.kind === "tableRow") {
      const availableWidth = width - side * 2;
      const firstWidth = block.columnCount >= 4 ? availableWidth * 0.32 : availableWidth / block.columnCount;
      const otherWidth =
        block.columnCount > 1 ? (availableWidth - firstWidth) / (block.columnCount - 1) : availableWidth;
      measureContext.font = `${block.header ? "700" : "500"} ${block.columnCount >= 6 ? 16 : 19}px Arial`;
      const maxLines = Math.max(
        1,
        ...block.cells.map((cell, index) => {
          const cellWidth =
            index === 0 ? firstWidth + otherWidth * (cell.span - 1) : otherWidth * cell.span;
          return wrapText(measureContext, cell.text, cellWidth - 20).length;
        })
      );
      estimatedHeight += maxLines * 27 + 24;
      return;
    }
    measureContext.font =
      block.kind === "title"
        ? "800 38px Arial"
        : block.kind === "heading"
          ? "700 27px Arial"
          : "500 20px Arial";
    estimatedHeight +=
      wrapText(measureContext, block.text, width - side * 2).length * 39 +
      (block.kind === "spacer" ? 22 : 20);
  });
  estimatedHeight += Math.ceil(estimatedHeight / pageSliceHeight) * 60;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(900, estimatedHeight + 80);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PDF sayfası hazırlanamadı.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  let y = 70;

  blocks.forEach((block) => {
    if (block.kind === "tableRow") {
      const availableWidth = width - side * 2;
      const firstWidth = block.columnCount >= 4 ? availableWidth * 0.32 : availableWidth / block.columnCount;
      const otherWidth =
        block.columnCount > 1 ? (availableWidth - firstWidth) / (block.columnCount - 1) : availableWidth;
      const fontSize = block.columnCount >= 6 ? 16 : 19;
      const tableLineHeight = fontSize + 9;
      context.font = `${block.header ? "700" : "500"} ${fontSize}px Arial`;
      const cellLayouts = block.cells.map((cell, index) => {
        const cellWidth =
          index === 0 ? firstWidth + otherWidth * (cell.span - 1) : otherWidth * cell.span;
        return { ...cell, cellWidth, lines: wrapText(context, cell.text, cellWidth - 20) };
      });
      const rowHeight = Math.max(1, ...cellLayouts.map((cell) => cell.lines.length)) * tableLineHeight + 24;
      const pageOffset = y % pageSliceHeight;
      if (pageOffset + rowHeight > pageSliceHeight - 30) {
        y += pageSliceHeight - pageOffset + 30;
      }

      let x = side;
      cellLayouts.forEach((cell, index) => {
        context.fillStyle = block.header
          ? "#1e3a8a"
          : index === 0
            ? block.rowIndex % 2 === 0
              ? "#dbeafe"
              : "#bfdbfe"
            : block.rowIndex % 2 === 0
              ? "#f8fafc"
              : "#eff6ff";
        context.fillRect(x, y, cell.cellWidth, rowHeight);
        context.strokeStyle = block.header ? "#1e40af" : "#93c5fd";
        context.lineWidth = block.header ? 2 : 1.5;
        context.strokeRect(x, y, cell.cellWidth, rowHeight);
        context.fillStyle = block.header ? "#ffffff" : index === 0 ? "#172554" : "#1f2937";
        cell.lines.forEach((line, lineIndex) => {
          context.fillText(line, x + 10, y + 22 + lineIndex * tableLineHeight);
        });
        x += cell.cellWidth;
      });
      y += rowHeight;
      return;
    }

    if (block.kind === "spacer") {
      y += 24;
      return;
    }

    const isTitle = block.kind === "title";
    const isHeading = block.kind === "heading";
    context.font = isTitle
      ? "800 38px Arial"
      : isHeading
        ? "700 27px Arial"
        : "500 20px Arial";
    context.fillStyle = isTitle ? "#172554" : isHeading ? "#1e3a8a" : "#1f2937";
    wrapText(context, block.text, width - side * 2).forEach((line) => {
      context.fillText(line, side, y);
      y += 39;
    });
    y += 20;
  });

  return canvas;
}

async function canvasToPdfBlob(canvas: HTMLCanvasElement) {
  const encoder = new TextEncoder();
  const pageWidth = 842;
  const pageHeight = 595;
  const sourcePageHeight = Math.floor(canvas.width * (pageHeight / pageWidth));
  const images: Array<{ bytes: Uint8Array; width: number; height: number }> = [];

  for (let sourceY = 0; sourceY < canvas.height; sourceY += sourcePageHeight) {
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sourcePageHeight;
    const context = slice.getContext("2d");
    if (!context) throw new Error("PDF sayfası oluşturulamadı.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, slice.width, slice.height);
    context.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      Math.min(sourcePageHeight, canvas.height - sourceY),
      0,
      0,
      canvas.width,
      Math.min(sourcePageHeight, canvas.height - sourceY)
    );
    const jpeg = await new Promise<Blob>((resolve, reject) => {
      slice.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PDF görseli oluşturulamadı."))),
        "image/jpeg",
        0.94
      );
    });
    images.push({ bytes: new Uint8Array(await jpeg.arrayBuffer()), width: slice.width, height: slice.height });
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
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/${imageName} Do\nQ`;
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

function safeFileName(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function GoalDetailPdfButton({ scopeLabel }: GoalDetailPdfButtonProps) {
  const [isPreparing, setIsPreparing] = useState(false);
  const [message, setMessage] = useState("");

  async function downloadPdf() {
    const page = document.querySelector<HTMLElement>("main.goal-page");
    if (!page) return;

    setIsPreparing(true);
    setMessage("");
    const details = Array.from(page.querySelectorAll<HTMLDetailsElement>("details"));
    const previouslyOpen = new Set(details.filter((detail) => detail.open));

    try {
      details.forEach((detail) => {
        detail.open = true;
      });
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
      );

      const canvas = buildGoalPdfCanvas(page, scopeLabel);
      const pdfBlob = await canvasToPdfBlob(canvas);
      const url = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeFileName(scopeLabel) || "hedef-gerceklesen"}-hedef-gerceklesen.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("PDF doğrudan indirildi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF indirilemedi.");
    } finally {
      details.forEach((detail) => {
        detail.open = previouslyOpen.has(detail);
      });
      setIsPreparing(false);
    }
  }

  return (
    <div className="goal-detail-pdf-actions">
      <button
        aria-label="Hedef gerçekleşen tablolarını PDF olarak indir"
        className="goal-detail-pdf-button"
        disabled={isPreparing}
        onClick={downloadPdf}
        type="button"
      >
        <span aria-hidden="true">PDF</span>
        {isPreparing ? "PDF Hazırlanıyor..." : "PDF Olarak İndir"}
      </button>
      <p>{message || "Tüm tablolar ve açılır alt kırılımlar PDF'e açık olarak dahil edilir."}</p>
    </div>
  );
}
