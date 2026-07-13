"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ScoringType } from "@/lib/types";

type DuelEntryCardProps = {
  duelId: string;
  scoring: ScoringType;
  products: Array<{
    id: string;
    name: string;
    unit_label: string;
    base_points: number;
  }>;
  participants: Array<{
    id: string;
    label: string;
    participantMode: "profile" | "group";
    memberLabels: string[];
  }>;
  defaultParticipantId: string | null;
  initialQuantities: Record<string, number>;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function buildKey(participantId: string | null, productId: string) {
  return `${participantId ?? "none"}__${productId}`;
}

function unitLabel(scoring: ScoringType, productUnit: string) {
  return scoring === "points" ? "Puan adedi" : productUnit;
}

export function DuelEntryCard({
  duelId,
  scoring,
  products,
  participants,
  defaultParticipantId,
  initialQuantities
}: DuelEntryCardProps) {
  const [selectedParticipantId, setSelectedParticipantId] = useState(
    defaultParticipantId ?? participants[0]?.id ?? ""
  );
  const [draftValues, setDraftValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initialQuantities).map(([key, value]) => [key, String(value)]))
  );
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [errorMessages, setErrorMessages] = useState<Record<string, string>>({});
  const timeoutRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!selectedParticipantId && participants[0]?.id) {
      setSelectedParticipantId(participants[0].id);
    }
  }, [participants, selectedParticipantId]);

  useEffect(() => {
    return () => {
      Object.values(timeoutRefs.current).forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, []);

  const selectedParticipant = useMemo(
    () => participants.find((participant) => participant.id === selectedParticipantId) ?? null,
    [participants, selectedParticipantId]
  );

  const currentEntries = useMemo(
    () =>
      products.map((product) => {
        const key = buildKey(selectedParticipantId, product.id);
        return {
          product,
          key,
          value: draftValues[key] ?? String(initialQuantities[key] ?? 0),
          state: saveStates[key] ?? "idle",
          error: errorMessages[key] ?? ""
        };
      }),
    [draftValues, errorMessages, initialQuantities, products, saveStates, selectedParticipantId]
  );

  async function persistQuantity(productId: string, nextValue: number, participantId: string) {
    const key = buildKey(participantId, productId);
    setSaveStates((current) => ({ ...current, [key]: "saving" }));
    setErrorMessages((current) => ({ ...current, [key]: "" }));

    try {
      const response = await fetch("/api/duel-sales/live", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          duelId,
          productId,
          participantId,
          quantity: nextValue
        })
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

  function scheduleSave(productId: string, rawValue: string, participantId: string) {
    const key = buildKey(participantId, productId);
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

      void persistQuantity(productId, Math.max(0, parsed), participantId);
    }, 350);
  }

  function updateValue(productId: string, nextValue: string) {
    if (!selectedParticipantId) {
      return;
    }

    const key = buildKey(selectedParticipantId, productId);
    setDraftValues((current) => ({ ...current, [key]: nextValue }));
    setSaveStates((current) => ({ ...current, [key]: "idle" }));
    setErrorMessages((current) => ({ ...current, [key]: "" }));
    scheduleSave(productId, nextValue, selectedParticipantId);
  }

  function bumpValue(productId: string, delta: number) {
    if (!selectedParticipantId) {
      return;
    }

    const key = buildKey(selectedParticipantId, productId);
    const currentNumericValue = Number(draftValues[key] ?? initialQuantities[key] ?? 0) || 0;
    const nextNumericValue = Math.max(0, currentNumericValue + delta);
    const nextValue = String(nextNumericValue);
    setDraftValues((current) => ({ ...current, [key]: nextValue }));
    setSaveStates((current) => ({ ...current, [key]: "idle" }));
    setErrorMessages((current) => ({ ...current, [key]: "" }));
    scheduleSave(productId, nextValue, selectedParticipantId);
  }

  return (
    <section className="live-sale-entry-shell">
      <label className="field compact live-sale-target-select">
        <span>Hedef Taraf</span>
        <select
          value={selectedParticipantId}
          onChange={(event) => setSelectedParticipantId(event.target.value)}
        >
          {participants.map((participant) => (
            <option key={participant.id} value={participant.id}>
              {participant.label}
              {participant.participantMode === "group" ? " | Grup" : ""}
            </option>
          ))}
        </select>
      </label>

      {selectedParticipant ? (
        <section className="live-sale-summary campaign-product-summary">
          <div className="live-sale-summary-head">
            <strong>{selectedParticipant.label}</strong>
            <span>
              {selectedParticipant.participantMode === "group"
                ? selectedParticipant.memberLabels.join(", ")
                : "Kisi bazli duello girisi"}
            </span>
          </div>
        </section>
      ) : null}

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
