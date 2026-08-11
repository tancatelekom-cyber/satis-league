"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Props = {
  branches: string[];
  selectedBranch: string;
  products?: string[];
  selectedProduct?: string;
  view?: string;
};

export function StockBranchFilter({ branches, selectedBranch, products = [], selectedProduct = "", view = "" }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(branch: string, product: string) {
    startTransition(() => {
      const query = new URLSearchParams();
      if (view) query.set("view", view);
      if (branch) query.set("branch", branch);
      if (product) query.set("product", product);
      router.push(`/stok-bilgisi${query.size ? `?${query}` : ""}`);
    });
  }

  return (
    <>
    <label>
      <span>Şube filtresi</span>
      <select
        aria-label="Şube filtresi"
        value={selectedBranch}
        disabled={isPending}
        onChange={(event) => navigate(event.target.value, selectedProduct)}
      >
        <option value="">Firma Tümü</option>
        {branches.map((branch) => <option value={branch} key={branch}>{branch}</option>)}
      </select>
    </label>
    {view === "all" ? <label>
      <span>Ürün kısa adı</span>
      <select aria-label="Ürün kısa adı" value={selectedProduct} disabled={isPending} onChange={(event) => navigate(selectedBranch, event.target.value)}>
        <option value="">Tüm ürünler</option>
        {products.map((product) => <option value={product} key={product}>{product}</option>)}
      </select>
    </label> : null}
    </>
  );
}
