"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Props = {
  categories: string[];
  selectedCategory: string;
  brands: string[];
  modelsByBrand: Record<string, string[]>;
  selectedBrand: string;
  selectedModel: string;
};

export function StockMonthlySalesFilter({ categories, selectedCategory, brands, modelsByBrand, selectedBrand, selectedModel }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const models = selectedBrand ? modelsByBrand[selectedBrand] ?? [] : [];

  function navigate(brand: string, model = "", category = selectedCategory) {
    const query = new URLSearchParams();
    if (category) query.set("category", category);
    if (brand) query.set("brand", brand);
    if (brand && model) query.set("model", model);
    startTransition(() => router.push(`/stok-bilgisi/aylik-satislar${query.size ? `?${query}` : ""}`));
  }

  return (
    <div className="stock-monthly-filters">
      <label><span>Kategori</span><select aria-label="Kategori filtresi" value={selectedCategory} disabled={isPending} onChange={(event) => navigate("", "", event.target.value)}>
        <option value="">Tüm kategoriler</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}
      </select></label>
      <label><span>Marka</span><select aria-label="Marka filtresi" value={selectedBrand} disabled={isPending} onChange={(event) => navigate(event.target.value)}>
        <option value="">Tüm markalar</option>{brands.map((brand) => <option value={brand} key={brand}>{brand}</option>)}
      </select></label>
      <label><span>Model</span><select aria-label="Model filtresi" value={selectedModel} disabled={isPending || !selectedBrand} onChange={(event) => navigate(selectedBrand, event.target.value)}>
        <option value="">{selectedBrand ? "Tüm modeller" : "Önce marka seçin"}</option>{models.map((model) => <option value={model} key={model}>{model}</option>)}
      </select></label>
      {(selectedCategory || selectedBrand || selectedModel) ? <button type="button" disabled={isPending} onClick={() => navigate("", "", "")}>Filtreyi temizle</button> : null}
    </div>
  );
}
