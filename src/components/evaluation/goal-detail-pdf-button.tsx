"use client";

import { useState } from "react";

type GoalDetailPdfButtonProps = {
  scopeLabel: string;
};

export function GoalDetailPdfButton({ scopeLabel }: GoalDetailPdfButtonProps) {
  const [isPreparing, setIsPreparing] = useState(false);

  function downloadPdf() {
    const page = document.querySelector<HTMLElement>("main.goal-page");
    if (!page) return;

    setIsPreparing(true);

    const details = Array.from(page.querySelectorAll<HTMLDetailsElement>("details"));
    const previouslyOpen = new Set(details.filter((detail) => detail.open));
    const previousTitle = document.title;

    details.forEach((detail) => {
      detail.open = true;
    });
    page.classList.add("goal-pdf-printing");
    document.title = `${scopeLabel} Hedef Gerçekleşen`;

    const restorePage = () => {
      details.forEach((detail) => {
        detail.open = previouslyOpen.has(detail);
      });
      page.classList.remove("goal-pdf-printing");
      document.title = previousTitle;
      setIsPreparing(false);
    };

    window.addEventListener("afterprint", restorePage, { once: true });

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
        window.setTimeout(() => {
          if (page.classList.contains("goal-pdf-printing")) restorePage();
        }, 1000);
      });
    });
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
      <p>Tüm tablolar ve açılır alt kırılımlar PDF&apos;e dahil edilir.</p>
    </div>
  );
}
