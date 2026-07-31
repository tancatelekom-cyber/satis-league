"use client";

import { useEffect, useState } from "react";

type CompanyTrendCategoryFilterProps = {
  categories: string[];
  targetId: string;
};

export function CompanyTrendCategoryFilter({
  categories,
  targetId
}: CompanyTrendCategoryFilterProps) {
  const [selectedCategory, setSelectedCategory] = useState("");

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;

    target.querySelectorAll<HTMLElement>("[data-company-trend-category]").forEach((row) => {
      row.hidden =
        selectedCategory !== "" &&
        row.dataset.companyTrendCategory !== selectedCategory;
    });

    target.querySelectorAll<HTMLElement>("[data-company-filter-table]").forEach((table) => {
      const categoryRows = Array.from(
        table.querySelectorAll<HTMLElement>("[data-company-trend-category]")
      );
      table.hidden =
        selectedCategory !== "" &&
        !categoryRows.some(
          (row) => row.dataset.companyTrendCategory === selectedCategory
        );
    });

    target
      .querySelectorAll<HTMLElement>("[data-company-filter-hide-when-active]")
      .forEach((section) => {
        section.hidden = selectedCategory !== "";
      });
  }, [selectedCategory, targetId]);

  return (
    <label className="goal-company-category-filter">
      <span>Kategori filtresi</span>
      <select
        aria-label="Ay sonu gidişat özeti kategori filtresi"
        value={selectedCategory}
        onChange={(event) => setSelectedCategory(event.target.value)}
      >
        <option value="">Tüm kategoriler</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    </label>
  );
}
