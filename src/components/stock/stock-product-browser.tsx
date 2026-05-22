"use client";

import { useMemo, useState } from "react";
import type { AymadaStockProduct } from "@/lib/aymada-stock";

type StockProductBrowserProps = {
  products: AymadaStockProduct[];
};

const categoryLabels: Record<AymadaStockProduct["category"], string> = {
  smartphone: "Smartphone",
  tablet: "Tablet",
  iot: "IoT"
};

function formatNumber(value: number) {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function compactText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}

function getBrand(productName: string) {
  return productName.trim().split(/\s+/)[0]?.toLocaleUpperCase("tr-TR") || "MARKA YOK";
}

export function StockProductBrowser({ products }: StockProductBrowserProps) {
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [query, setQuery] = useState("");

  const brands = useMemo(() => {
    const brandSet = new Set<string>();
    for (const product of products) {
      if (category !== "all" && product.category !== category) continue;
      brandSet.add(getBrand(product.productCardName));
    }
    return [...brandSet].sort((a, b) => a.localeCompare(b, "tr"));
  }, [category, products]);

  const filteredProducts = useMemo(() => {
    const search = compactText(query);

    return products.filter((product) => {
      const productBrand = getBrand(product.productCardName);
      const haystack = compactText(
        [
          product.productCardName,
          product.productCardCode,
          product.productBarcode,
          product.categoryName,
          product.mainCategoryName,
          product.productTypeName,
          productBrand
        ].join(" ")
      );

      if (category !== "all" && product.category !== category) return false;
      if (brand !== "all" && productBrand !== brand) return false;
      if (search && !haystack.includes(search)) return false;

      return true;
    });
  }, [brand, category, products, query]);

  const filteredTotal = filteredProducts.reduce((sum, product) => sum + product.stockCount, 0);

  return (
    <div className="stock-browser">
      <section className="stock-filter-card" aria-label="Stok filtreleri">
        <label>
          <span>Kategori</span>
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setBrand("all");
            }}
          >
            <option value="all">Tum kategoriler</option>
            <option value="smartphone">Smartphone</option>
            <option value="tablet">Tablet</option>
            <option value="iot">IoT</option>
          </select>
        </label>

        <label>
          <span>Marka</span>
          <select value={brand} onChange={(event) => setBrand(event.target.value)}>
            <option value="all">Tum markalar</option>
            {brands.map((brandName) => (
              <option value={brandName} key={brandName}>
                {brandName}
              </option>
            ))}
          </select>
        </label>

        <label className="stock-search-field">
          <span>Metin arama</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Urun adi, kod veya barkod ara"
          />
        </label>

        <div className="stock-filter-summary">
          <span>{filteredProducts.length} urun</span>
          <strong>{formatNumber(filteredTotal)} stok</strong>
        </div>
      </section>

      {filteredProducts.length > 0 ? (
        <>
          <div className="stock-mobile-list">
            {filteredProducts.map((product) => (
              <article className="stock-branch-card" key={product.productCardId || product.productCardCode}>
                <div>
                  <span>
                    {getBrand(product.productCardName)} | {product.categoryName || product.mainCategoryName || product.productTypeName}
                  </span>
                  <strong>{product.productCardName}</strong>
                </div>
                <strong className="stock-branch-total">{formatNumber(product.stockCount)}</strong>
                <div className="stock-branch-split">
                  <span>{product.productCardCode || "Kod yok"}</span>
                  <span>{product.productBarcode || "Barkod yok"}</span>
                  <span>{categoryLabels[product.category]}</span>
                </div>
              </article>
            ))}
          </div>

          <div className="stock-table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Urun</th>
                  <th>Marka</th>
                  <th>Tip</th>
                  <th>Kategori</th>
                  <th>Kod</th>
                  <th>Stok</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.productCardId || product.productCardCode}>
                    <td>
                      <strong>{product.productCardName}</strong>
                      {product.productBarcode ? <span>{product.productBarcode}</span> : null}
                    </td>
                    <td>{getBrand(product.productCardName)}</td>
                    <td>{categoryLabels[product.category]}</td>
                    <td>{product.categoryName || product.mainCategoryName || "-"}</td>
                    <td>{product.productCardCode || "-"}</td>
                    <td>
                      <strong>{formatNumber(product.stockCount)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="stock-empty">Seciminize uygun stok bulunamadi.</p>
      )}
    </div>
  );
}
