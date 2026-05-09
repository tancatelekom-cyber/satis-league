"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CampaignOption = {
  id: string;
  name: string;
  mode: "employee" | "store";
  scoring: "points" | "quantity";
  products: Array<{
    id: string;
    name: string;
    base_points: number;
    unit_label: string;
  }>;
};

type EmployeeOption = {
  id: string;
  full_name: string;
};

type StoreOption = {
  id: string;
  name: string;
};

type AdminCampaignSaleFormProps = {
  campaigns: CampaignOption[];
  employees: EmployeeOption[];
  stores: StoreOption[];
  initialQuantities: Record<string, number>;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function buildKey(campaignId: string, targetId: string | null, productId: string) {
  return `${campaignId}__${targetId ?? "none"}__${productId}`;
}

export function AdminCampaignSaleForm({
  campaigns,
  employees,
  stores,
  initialQuantities
}: AdminCampaignSaleFormProps) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id ?? "");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employees[0]?.id ?? "");
  const [selectedStoreId, setSelectedStoreId] = useState(stores[0]?.id ?? "");
  const [draftValues, setDraftValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initialQuantities).map(([key, value]) => [key, String(value)]))
  );
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [errorMessages, setErrorMessages] = useState<Record<string, string>>({});
  const timeoutRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  );
  const currentTargetId =
    selectedCampaign?.mode === "store" ? selectedStoreId || null : selectedEmployeeId || null;
  const currentTargetLabel =
    selectedCampaign?.mode === "store"
      ? stores.find((store) => store.id === selectedStoreId)?.name ?? "Secili magaza"
      : employees.find((employee) => employee.id === selectedEmployeeId)?.full_name ?? "Secili personel";

  useEffect(() => {
    if (selectedCampaign?.mode === "store" && !selectedStoreId && stores[0]?.id) {
      setSelectedStoreId(stores[0].id);
    }

    if (selectedCampaign?.mode === "employee" && !selectedEmployeeId && employees[0]?.id) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedCampaign?.mode, selectedEmployeeId, selectedStoreId, stores]);

  useEffect(() => {
    return () => {
      Object.values(timeoutRefs.current).forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, []);

  const currentEntries = useMemo(
    () => {
      if (!selectedCampaign) {
        return [];
      }

      return selectedCampaign.products.map((product) => {
        const key = buildKey(selectedCampaign.id, currentTargetId, product.id);
        return {
          product,
          key,
          value: draftValues[key] ?? String(initialQuantities[key] ?? 0),
          state: saveStates[key] ?? "idle",
          error: errorMessages[key] ?? ""
        };
      });
    },
    [currentTargetId, draftValues, errorMessages, initialQuantities, saveStates, selectedCampaign]
  );

  async function persistQuantity(productId: string, nextValue: number, campaignId: string, targetId: string | null) {
    const key = buildKey(campaignId, targetId, productId);
    setSaveStates((current) => ({ ...current, [key]: "saving" }));
    setErrorMessages((current) => ({ ...current, [key]: "" }));

    const payload =
      selectedCampaign?.mode === "store"
        ? { campaignId, productId, quantity: nextValue, targetStoreId: targetId }
        : { campaignId, productId, quantity: nextValue, targetProfileId: targetId };

    try {
      const response = await fetch("/api/admin/campaign-sales/live", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = (await response.json().catch(() => ({ message: "Kayit sirasinda hata olustu." }))) as {
        message?: string;
        quantity?: number;
      };

      if (!response.ok) {
        setSaveStates((current) => ({ ...current, [key]: "error" }));
        setErrorMessages((current) => ({ ...current, [key]: result.message ?? "Kaydedilemedi." }));
        return;
      }

      const savedValue = String(Math.max(0, Number(result.quantity ?? nextValue)));
      setDraftValues((current) => ({ ...current, [key]: savedValue }));
      setSaveStates((current) => ({ ...current, [key]: "saved" }));

      window.setTimeout(() => {
        setSaveStates((current) => (current[key] === "saved" ? { ...current, [key]: "idle" } : current));
      }, 1200);
    } catch {
      setSaveStates((current) => ({ ...current, [key]: "error" }));
      setErrorMessages((current) => ({ ...current, [key]: "Baglanti hatasi olustu." }));
    }
  }

  function scheduleSave(productId: string, rawValue: string) {
    if (!selectedCampaign) {
      return;
    }

    const key = buildKey(selectedCampaign.id, currentTargetId, productId);
    if (timeoutRefs.current[key]) {
      clearTimeout(timeoutRefs.current[key]);
    }

    timeoutRefs.current[key] = setTimeout(() => {
      if (rawValue.trim() === "") {
        return;
      }

      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        setSaveStates((current) => ({ ...current, [key]: "error" }));
        setErrorMessages((current) => ({ ...current, [key]: "Gecerli bir sayi girin." }));
        return;
      }

      void persistQuantity(productId, Math.max(0, parsed), selectedCampaign.id, currentTargetId);
    }, 350);
  }

  function updateValue(productId: string, nextValue: string) {
    if (!selectedCampaign) {
      return;
    }

    const key = buildKey(selectedCampaign.id, currentTargetId, productId);
    setDraftValues((current) => ({ ...current, [key]: nextValue }));
    setSaveStates((current) => ({ ...current, [key]: "idle" }));
    setErrorMessages((current) => ({ ...current, [key]: "" }));
    scheduleSave(productId, nextValue);
  }

  function bumpValue(productId: string, delta: number) {
    if (!selectedCampaign) {
      return;
    }

    const key = buildKey(selectedCampaign.id, currentTargetId, productId);
    const currentNumericValue = Number(draftValues[key] ?? initialQuantities[key] ?? 0) || 0;
    const nextValue = String(Math.max(0, currentNumericValue + delta));
    setDraftValues((current) => ({ ...current, [key]: nextValue }));
    setSaveStates((current) => ({ ...current, [key]: "idle" }));
    setErrorMessages((current) => ({ ...current, [key]: "" }));
    scheduleSave(productId, nextValue);
  }

  return (
    <section className="live-sale-entry-shell">
      <div className="admin-live-sale-setup">
        <label className="field compact">
          <span>Kampanya</span>
          <select value={selectedCampaignId} onChange={(event) => setSelectedCampaignId(event.target.value)}>
            <option value="">Kampanya secin</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name} - {campaign.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"}
              </option>
            ))}
          </select>
        </label>

        {selectedCampaign?.mode === "store" ? (
          <label className="field compact">
            <span>Hedef Magaza</span>
            <select value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)}>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field compact">
            <span>Hedef Personel</span>
            <select value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)}>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!selectedCampaign ? (
        <div className="compact-sale-row empty admin-live-sale-empty">
          Once kampanya secin. Ardindan hedef personel veya magazayi secip canli satis girisine devam edin.
        </div>
      ) : (
        <>
          <section className="live-sale-summary" aria-label="Admin canli kampanya ozet tablosu">
            <div className="live-sale-summary-head">
              <strong>{selectedCampaign.mode === "store" ? "Magaza Urun Toplamlari" : "Kullanici Urun Toplamlari"}</strong>
              <span>{currentTargetLabel} icin anlik toplamlar</span>
            </div>
            <div className="live-sale-summary-table" role="table" aria-label="Admin canli kampanya toplam tablosu">
              <div className="live-sale-summary-row live-sale-summary-header" role="row">
                <span role="columnheader">Urun</span>
                <span role="columnheader">Toplam</span>
              </div>
              {currentEntries.map(({ product, value }) => (
                <div key={`summary-${product.id}`} className="live-sale-summary-row" role="row">
                  <span role="cell">{product.name}</span>
                  <strong role="cell">{Number(value || 0)}</strong>
                </div>
              ))}
            </div>
          </section>

          <div className="live-sale-list">
            {currentEntries.map(({ product, value, state, error }) => (
              <article key={product.id} className="live-sale-row">
                <div className="live-sale-copy">
                  <strong>{product.name}</strong>
                  <span>
                    {selectedCampaign.scoring === "points" ? "Puan adedi" : product.unit_label}
                    {state === "saving" ? " | Kaydediliyor..." : state === "saved" ? " | Kaydedildi" : ""}
                    {state === "error" && error ? ` | ${error}` : ""}
                  </span>
                </div>

                <div className="live-sale-controls">
                  <button className="live-sale-button" onClick={() => bumpValue(product.id, -1)} type="button">
                    -
                  </button>
                  <input
                    className="live-sale-input"
                    inputMode="numeric"
                    min={0}
                    onBlur={(event) => {
                      if (event.target.value.trim() === "") {
                        updateValue(product.id, "0");
                      }
                    }}
                    onChange={(event) => updateValue(product.id, event.target.value)}
                    type="number"
                    value={value}
                  />
                  <button className="live-sale-button" onClick={() => bumpValue(product.id, 1)} type="button">
                    +
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
