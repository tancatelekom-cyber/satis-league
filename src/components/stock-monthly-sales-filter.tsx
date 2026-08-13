"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Props = {
  brands: string[];
  modelsByBrand: Record<string, string[]>;
  selectedBrand: string;
  selectedModel: string;
};

export function StockMonthlySalesFilter({ brands, modelsByBrand, selectedBrand, selectedModel }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const models = selectedBrand ? modelsByBrand[selectedBrand] ?? [] : [];

  function navigate(brand: string, model = "") {
    const query = new URLSearchParams();
    if (brand) query.set("brand", brand);
    if (brand && model) query.set("model", model);
    startTransition(() => router.push(`/stok-bilgisi/aylik-satislar${query.size ? `?${query}` : ""}`));
  }

  return (
    <div className="stock-monthly-filters">
      <label><span>Marka</span><select aria-label="Marka filtresi" value={selectedBrand} disabled={isPending} onChange={(event) => navigate(event.target.value)}>
        <option value="">Tüm markalar</option>{brands.map((brand) => <option value={brand} key={brand}>{brand}</option>)}
      </select></label>
      <label><span>Model</span><select aria-label="Model filtresi" value={selectedModel} disabled={isPending || !selectedBrand} onChange={(event) => navigate(selectedBrand, event.target.value)}>
        <option value="">{selectedBrand ? "Tüm modeller" : "Önce marka seçin"}</option>{models.map((model) => <option value={model} key={model}>{model}</option>)}
      </select></label>
      {(selectedBrand || selectedModel) ? <button type="button" disabled={isPending} onClick={() => navigate("")}>Filtreyi temizle</button> : null}
    </div>
  );
}
