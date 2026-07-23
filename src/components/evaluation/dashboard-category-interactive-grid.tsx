"use client";

import { Children, type KeyboardEvent, type MouseEvent, type ReactNode, useState } from "react";

export function DashboardCategoryInteractiveGrid({ children }: { children: ReactNode }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const openCategory = (index: number, event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    if (target.closest("[data-dashboard-category-close]")) {
      event.preventDefault();
      event.stopPropagation();
      setOpenIndex(null);
      return;
    }

    if (target.closest(".goal-dashboard-category-hover-detail")) {
      return;
    }

    setOpenIndex(index);
  };

  const openCategoryWithKeyboard = (index: number, event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    setOpenIndex(index);
  };

  return (
    <div className="goal-dashboard-category-pies">
      {Children.map(children, (child, index) => (
        <div
          className="goal-dashboard-category-interactive-item"
          data-open={openIndex === index ? "true" : "false"}
          onClick={(event) => openCategory(index, event)}
          onKeyDown={(event) => openCategoryWithKeyboard(index, event)}
          tabIndex={0}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
