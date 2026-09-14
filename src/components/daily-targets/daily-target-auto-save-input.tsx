"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDailyTargetActualAction } from "@/app/gunluk-hedefler/actions";

type DailyTargetAutoSaveInputProps = {
  actual: number;
  ariaLabel: string;
  mainCategory: string;
  storeId: string;
  subCategory: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function DailyTargetAutoSaveInput({
  actual,
  ariaLabel,
  mainCategory,
  storeId,
  subCategory
}: DailyTargetAutoSaveInputProps) {
  const router = useRouter();
  const [value, setValue] = useState(String(actual));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("Otomatik kayıt");
  const [, startTransition] = useTransition();
  const lastSavedValue = useRef(String(actual));
  const editVersion = useRef(0);

  useEffect(() => {
    if (value === lastSavedValue.current) return;

    const version = editVersion.current;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      setMessage("Kaydediliyor…");

      void saveDailyTargetActualAction({
        actual: value,
        mainCategory,
        storeId,
        subCategory
      }).then((result) => {
        if (editVersion.current !== version) return;

        if (result.ok) {
          lastSavedValue.current = value;
          setSaveState("saved");
          setMessage("Kaydedildi");
          startTransition(() => router.refresh());
          return;
        }

        setSaveState("error");
        setMessage(result.message);
      }).catch(() => {
        if (editVersion.current !== version) return;
        setSaveState("error");
        setMessage("Kaydedilemedi. Tekrar deneyin.");
      });
    }, 650);

    return () => window.clearTimeout(timer);
  }, [mainCategory, router, storeId, subCategory, value]);

  return (
    <div className="daily-target-auto-save-field">
      <input
        aria-label={ariaLabel}
        inputMode="decimal"
        min="0"
        onChange={(event) => {
          editVersion.current += 1;
          setValue(event.target.value);
          setSaveState("idle");
          setMessage("Otomatik kayıt");
        }}
        step="0.01"
        type="number"
        value={value}
      />
      <small
        aria-live="polite"
        className={`daily-target-auto-save-status daily-target-auto-save-${saveState}`}
      >
        {saveState === "saved" ? <b aria-hidden="true">✓</b> : null}
        {message}
      </small>
    </div>
  );
}
