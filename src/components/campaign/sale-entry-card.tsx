"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CampaignMode, ScoringType } from "@/lib/types";

type TeamProfileOption = {
  id: string;
  full_name: string;
};

type SaleEntryCardProps = {
  campaignId: string;
  campaignMode: CampaignMode;
  scoring: ScoringType;
  products: Array<{
    id: string;
    name: string;
    unit_label: string;
    base_points: number;
  }>;
  defaultProfileId: string;
  defaultStoreId: string | null;
  isManager: boolean;
  teamProfiles: TeamProfileOption[];
  initialQuantities: Record<string, number>;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function buildKey(targetId: string | null, productId: string) {
  return `${targetId ?? "none"}__${productId}`;
}

function unitLabel(scoring: ScoringType, productUnit: string) {
  return scoring === "points" ? "Puan adedi" : productUnit;
}

export function SaleEntryCard({
  campaignId,
  campaignMode,
  scoring,
  products,
  defaultProfileId,
  defaultStoreId,
  isManager,
  teamProfiles,
  initialQuantities
}: SaleEntryCardProps) {
  const [selectedProfileId, setSelectedProfileId] = useState(defaultProfileId);
  const [draftValues, setDraftValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initialQuantities).map(([key, value]) => [key, String(value)]))
  );
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [errorMessages, setErrorMessages] = useState<Record<string, string>>({});
  const timeoutRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const currentTargetId = campaignMode === "employee" ? selectedProfileId : defaultStoreId;
  const selectedProfileName =
    campaignMode === "employee"
      ? teamProfiles.find((person) => person.id === selectedProfileId)?.full_name ?? "Secili personel"
      : null;
  const summaryTitle = campaignMode === "employee" ? "Kullanici Urun Toplamlari" : "Magaza Urun Toplamlari";
  const summaryHint =
    campaignMode === "employee"
      ? `${selectedProfileName ?? "Secili personel"} icin anlik toplam adetler`
      : "Secili magazanin anlik urun toplamlari";

  const currentEntries = useMemo(
    () =>
      products.map((product) => {
        const key = buildKey(currentTargetId, product.id);
        return {
          product,
          key,
          value: draftValues[key] ?? String(initialQuantities[key] ?? 0),
          state: saveStates[key] ?? "idle",
          error: errorMessages[key] ?? ""
        };
      }),
    [currentTargetId, draftValues, errorMessages, initialQuantities, products, saveStates]
  );

  useEffect(() => {
    return () => {
      Object.values(timeoutRefs.current).forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, []);

  async function persistQuantity(productId: string, nextValue: number, targetId: string | null) {
    const key = buildKey(targetId, productId);
    setSaveStates((current) => ({ ...current, [key]: "saving" }));
    setErrorMessages((current) => ({ ...current, [key]: "" }));

    const payload =
      campaignMode === "employee"
        ? {
            campaignId,
            productId,
            quantity: nextValue,
            targetProfileId: targetId
          }
        : {
            campaignId,
            productId,
            quantity: nextValue,
            targetStoreId: targetId
          };

    try {
      const response = await fetch("/api/campaign-sales/live", {
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

  function scheduleSave(productId: string, rawValue: string, targetId: string | null) {
    const key = buildKey(targetId, productId);
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

      void persistQuantity(productId, Math.max(0, parsed), targetId);
    }, 350);
  }

  function updateValue(productId: string, nextValue: string) {
    const key = buildKey(currentTargetId, productId);
    setDraftValues((current) => ({ ...current, [key]: nextValue }));
    setSaveStates((current) => ({ ...current, [key]: "idle" }));
    setErrorMessages((current) => ({ ...current, [key]: "" }));
    scheduleSave(productId, nextValue, currentTargetId);
  }

  function bumpValue(productId: string, delta: number) {
    const key = buildKey(currentTargetId, productId);
    const currentNumericValue = Number(draftValues[key] ?? initialQuantities[key] ?? 0) || 0;
    const nextNumericValue = Math.max(0, currentNumericValue + delta);
    const nextValue = String(nextNumericValue);
    setDraftValues((current) => ({ ...current, [key]: nextValue }));
    setSaveStates((current) => ({ ...current, [key]: "idle" }));
    setErrorMessages((current) => ({ ...current, [key]: "" }));
    scheduleSave(productId, nextValue, currentTargetId);
  }

  return (
    <section className="live-sale-entry-shell">
      {campaignMode === "employee" && isManager && teamProfiles.length > 0 ? (
        <label className="field compact live-sale-target-select">
          <span>Hedef Personel</span>
          <select
            defaultValue={defaultProfileId}
            name="targetProfileId"
            onChange={(event) => setSelectedProfileId(event.target.value)}
          >
            {teamProfiles.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <section className="live-sale-summary" aria-label={summaryTitle}>
        <div className="live-sale-summary-head">
          <strong>{summaryTitle}</strong>
          <span>{summaryHint}</span>
        </div>
        <div className="live-sale-summary-table" role="table" aria-label={summaryTitle}>
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
                {unitLabel(scoring, product.unit_label)}
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
    </section>
  );
}
