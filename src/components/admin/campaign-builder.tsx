"use client";

import { useState } from "react";
import { AdminStore } from "@/lib/types";

type ProductRow = {
  id: string;
  name: string;
  points: string;
  unit: string;
};

type StoreMultiplierRow = {
  id: string;
  storeName: string;
  multiplier: string;
};

type CampaignBuilderProps = {
  stores: AdminStore[];
};

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function CampaignBuilder({ stores }: CampaignBuilderProps) {
  const [products, setProducts] = useState<ProductRow[]>([
    { id: createId("product"), name: "", points: "1", unit: "adet" }
  ]);
  const [storeMultipliers, setStoreMultipliers] = useState<StoreMultiplierRow[]>([
    { id: createId("store"), storeName: "", multiplier: "1" }
  ]);
  const [feedback, setFeedback] = useState("");

  function updateProduct(id: string, field: keyof ProductRow, value: string) {
    setProducts((current) =>
      current.map((product) => (product.id === id ? { ...product, [field]: value } : product))
    );
  }

  function updateStoreMultiplier(id: string, field: keyof StoreMultiplierRow, value: string) {
    setStoreMultipliers((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }

  function addProductRow() {
    setProducts((current) => [
      ...current,
      { id: createId("product"), name: "", points: "1", unit: "adet" }
    ]);
    setFeedback("Yeni urun satiri eklendi.");
  }

  function addStoreMultiplierRow() {
    setStoreMultipliers((current) => [
      ...current,
      { id: createId("store"), storeName: "", multiplier: "1" }
    ]);
    setFeedback("Yeni magaza carpani satiri eklendi.");
  }

  const productsPayload = products
    .map((product) => `${product.name.trim()}|${product.points.trim() || "1"}|${product.unit.trim() || "adet"}`)
    .filter((line) => !line.startsWith("|"))
    .join("\n");

  const storeMultipliersPayload = storeMultipliers
    .map((item) => `${item.storeName.trim()}|${item.multiplier.trim() || "1"}`)
    .filter((line) => !line.startsWith("|"))
    .join("\n");

  return (
    <>
      <div className="field-group">
        <div className="repeater-header">
          <div>
            <span>Urunler</span>
            <small className="repeater-subtitle">{products.length} urun satiri hazir</small>
          </div>
          <button
            className="tiny-button approve"
            onClick={addProductRow}
            type="button"
          >
            Urun Ekle
          </button>
        </div>

        <div className="repeater-list">
          {products.map((product, index) => (
            <div key={product.id} className="repeater-row">
              <label className="field compact">
                <span>Urun Adi</span>
                <input
                  onChange={(event) => updateProduct(product.id, "name", event.target.value)}
                  placeholder="Ornek: Kasko Paketi"
                  value={product.name}
                />
              </label>

              <label className="field compact">
                <span>Puan</span>
                <input
                  min="1"
                  onChange={(event) => updateProduct(product.id, "points", event.target.value)}
                  type="number"
                  value={product.points}
                />
              </label>

              <label className="field compact">
                <span>Birim</span>
                <input
                  onChange={(event) => updateProduct(product.id, "unit", event.target.value)}
                  placeholder="adet"
                  value={product.unit}
                />
              </label>

              <div className="repeater-actions">
                <span>Urun #{index + 1}</span>
                <button
                  className="tiny-button"
                  disabled={products.length === 1}
                  onClick={() => {
                    setProducts((current) => current.filter((item) => item.id !== product.id));
                    setFeedback("Urun satiri silindi.");
                  }}
                  type="button"
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="field-group">
        <div className="repeater-header">
          <div>
            <span>Kampanya Magaza Carpanlari</span>
            <small className="repeater-subtitle">
              {storeMultipliers.length} magaza carpani satiri hazir
            </small>
          </div>
          <button
            className="tiny-button approve"
            onClick={addStoreMultiplierRow}
            type="button"
          >
            Magaza Ekle
          </button>
        </div>

        <div className="repeater-list">
          {storeMultipliers.map((item, index) => (
            <div key={item.id} className="repeater-row">
              <label className="field compact">
                <span>Magaza</span>
                <select
                  onChange={(event) => updateStoreMultiplier(item.id, "storeName", event.target.value)}
                  value={item.storeName}
                >
                  <option value="">Magaza secin</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.name}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field compact">
                <span>Carpan</span>
                <input
                  min="0"
                  onChange={(event) => updateStoreMultiplier(item.id, "multiplier", event.target.value)}
                  step="0.01"
                  type="number"
                  value={item.multiplier}
                />
              </label>

              <div className="repeater-actions">
                <span>Magaza #{index + 1}</span>
                <button
                  className="tiny-button"
                  disabled={storeMultipliers.length === 1}
                  onClick={() => {
                    setStoreMultipliers((current) => current.filter((row) => row.id !== item.id));
                    setFeedback("Magaza carpani satiri silindi.");
                  }}
                  type="button"
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {feedback ? <div className="inline-feedback">{feedback}</div> : null}

      <input name="products" type="hidden" value={productsPayload} />
      <input name="storeMultipliers" type="hidden" value={storeMultipliersPayload} />
    </>
  );
}
