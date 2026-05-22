"use client";

import { useMemo, useState } from "react";
import type { AymadaStockProduct } from "@/lib/aymada-stock";

type StockProductBrowserProps = {
  products: AymadaStockProduct[];
};

type StockProductGroup = {
  id: string;
  productCardName: string;
  brand: string;
  productTypeName: string;
  categoryName: string;
  mainCategoryName: string;
  category: AymadaStockProduct["category"];
  stockCount: number;
  branches: Array<{
    branchName: string;
    stockCount: number;
  }>;
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

function groupProductsByName(products: AymadaStockProduct[]) {
  const groupMap = new Map<string, StockProductGroup>();

  for (const product of products) {
    const key = [product.category, product.categoryName, product.productCardName].join("||");
    const brand = getBrand(product.productCardName);
    const group = groupMap.get(key) ?? {
      id: key,
      productCardName: product.productCardName,
      brand,
      productTypeName: product.productTypeName,
      categoryName: product.categoryName,
      mainCategoryName: product.mainCategoryName,
      category: product.category,
      stockCount: 0,
      branches: []
    };
    const branchName = product.branchName || "Sube yok";
    const branchRow = group.branches.find((item) => item.branchName === branchName);

    group.stockCount += product.stockCount;

    if (branchRow) {
      branchRow.stockCount += product.stockCount;
    } else {
      group.branches.push({
        branchName,
        stockCount: product.stockCount
      });
    }

    groupMap.set(key, group);
  }

  return [...groupMap.values()]
    .map((group) => ({
      ...group,
      branches: group.branches.sort((a, b) => b.stockCount - a.stockCount || a.branchName.localeCompare(b.branchName, "tr"))
    }))
    .sort(
      (a, b) =>
        b.stockCount - a.stockCount ||
        a.categoryName.localeCompare(b.categoryName, "tr") ||
        a.productCardName.localeCompare(b.productCardName, "tr")
    );
}

function BranchStockList({ branches }: { branches: StockProductGroup["branches"] }) {
  return (
    <div className="stock-product-branches">
      {branches.map((branchItem) => (
        <span key={branchItem.branchName}>
          <b>{branchItem.branchName}</b>
          <strong>{formatNumber(branchItem.stockCount)}</strong>
        </span>
      ))}
    </div>
  );
}

export function StockProductBrowser({ products }: StockProductBrowserProps) {
  const [branch, setBranch] = useState("all");
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [query, setQuery] = useState("");

  const branches = useMemo(() => {
    const branchSet = new Set<string>();
    for (const product of products) {
      branchSet.add(product.branchName || "Sube yok");
    }
    return [...branchSet].sort((a, b) => a.localeCompare(b, "tr"));
  }, [products]);

  const brands = useMemo(() => {
    const brandSet = new Set<string>();
    for (const product of products) {
      if (branch !== "all" && product.branchName !== branch) continue;
      if (category !== "all" && product.category !== category) continue;
      brandSet.add(getBrand(product.productCardName));
    }
    return [...brandSet].sort((a, b) => a.localeCompare(b, "tr"));
  }, [branch, category, products]);

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
          product.branchName,
          productBrand
        ].join(" ")
      );

      if (branch !== "all" && product.branchName !== branch) return false;
      if (category !== "all" && product.category !== category) return false;
      if (brand !== "all" && productBrand !== brand) return false;
      if (search && !haystack.includes(search)) return false;

      return true;
    });
  }, [branch, brand, category, products, query]);

  const filteredTotal = filteredProducts.reduce((sum, product) => sum + product.stockCount, 0);
  const groupedProducts = useMemo(() => groupProductsByName(filteredProducts), [filteredProducts]);

  return (
    <div className="stock-browser">
      <section className="stock-filter-card" aria-label="Stok filtreleri">
        <label>
          <span>Sube</span>
          <select
            value={branch}
            onChange={(event) => {
              setBranch(event.target.value);
              setBrand("all");
            }}
          >
            <option value="all">Tum subeler</option>
            {branches.map((branchName) => (
              <option value={branchName} key={branchName}>
                {branchName}
              </option>
            ))}
          </select>
        </label>

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
          <span>{groupedProducts.length} urun</span>
          <strong>{formatNumber(filteredTotal)} stok</strong>
        </div>
      </section>

      {groupedProducts.length > 0 ? (
        <>
          <div className="stock-mobile-list">
            {groupedProducts.map((product) => (
              <details className="stock-branch-card stock-product-detail-card" key={product.id}>
                <summary>
                  <div>
                    <span>
                      {product.brand} | {product.categoryName || product.mainCategoryName || product.productTypeName}
                    </span>
                    <strong>{product.productCardName}</strong>
                  </div>
                  <strong className="stock-branch-total">{formatNumber(product.stockCount)}</strong>
                </summary>
                <BranchStockList branches={product.branches} />
              </details>
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
                  <th>Stok</th>
                </tr>
              </thead>
              <tbody>
                {groupedProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <details className="stock-table-product-detail">
                        <summary>
                          <strong>{product.productCardName}</strong>
                          <span>Sube adetlerini goster</span>
                        </summary>
                        <BranchStockList branches={product.branches} />
                      </details>
                    </td>
                    <td>{product.brand}</td>
                    <td>{categoryLabels[product.category]}</td>
                    <td>{product.categoryName || product.mainCategoryName || "-"}</td>
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
