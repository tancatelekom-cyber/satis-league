"use client";

import { useEffect, useRef, useState } from "react";

type PressCopyFieldProps = {
  className?: string;
  copyText?: string | null;
  inline?: boolean;
  label?: string;
  labelClassName?: string;
  value: string;
  valueClassName?: string;
};

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "absolute";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

export function PressCopyField({
  className = "",
  copyText,
  inline = false,
  label,
  labelClassName = "",
  value,
  valueClassName = ""
}: PressCopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const holdTimeoutRef = useRef<number | null>(null);
  const resetTimeoutRef = useRef<number | null>(null);
  const canCopy = Boolean(copyText && copyText.trim() && copyText.trim() !== "-");

  useEffect(() => {
    return () => {
      if (holdTimeoutRef.current) {
        window.clearTimeout(holdTimeoutRef.current);
      }

      if (resetTimeoutRef.current) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  function clearHoldTimer() {
    if (holdTimeoutRef.current) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  }

  async function handleCopy() {
    if (!canCopy || !copyText) {
      return;
    }

    clearHoldTimer();

    try {
      await copyTextToClipboard(copyText);
      setCopied(true);

      if (resetTimeoutRef.current) {
        window.clearTimeout(resetTimeoutRef.current);
      }

      resetTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 1600);
    } catch {
      setCopied(false);
    }
  }

  function startHold() {
    if (!canCopy) {
      return;
    }

    clearHoldTimer();
    holdTimeoutRef.current = window.setTimeout(() => {
      void handleCopy();
    }, 450);
  }

  const combinedClassName = [
    className,
    canCopy ? "press-copy-field" : "",
    inline ? "press-copy-field-inline" : "",
    copied ? "press-copy-field-copied" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      aria-label={canCopy ? "Basili tutarak kopyala" : undefined}
      className={combinedClassName}
      onContextMenu={(event) => {
        if (canCopy) {
          event.preventDefault();
        }
      }}
      onKeyDown={(event) => {
        if (!canCopy) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void handleCopy();
        }
      }}
      onPointerCancel={clearHoldTimer}
      onPointerDown={startHold}
      onPointerLeave={clearHoldTimer}
      onPointerUp={clearHoldTimer}
      role={canCopy ? "button" : undefined}
      tabIndex={canCopy ? 0 : undefined}
      title={canCopy ? "Basili tutarak kopyala" : undefined}
    >
      {label ? <span className={labelClassName}>{label}</span> : null}
      <strong className={valueClassName}>{value}</strong>
      {copied ? <em className="press-copy-feedback">Kopyalandi</em> : null}
    </div>
  );
}
