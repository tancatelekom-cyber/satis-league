"use client";

import { useState } from "react";

export function CopyCoachingButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button className="button-primary evaluation-copy-button" type="button" onClick={handleCopy}>
      {copied ? "Kopyalandi" : "Kocluk Metnini Kopyala"}
    </button>
  );
}
