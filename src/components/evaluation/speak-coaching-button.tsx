"use client";

import { useEffect, useRef, useState } from "react";

function pickTurkishVoice(voices: SpeechSynthesisVoice[]) {
  return voices.find((voice) => voice.lang.toLocaleLowerCase("tr-TR").startsWith("tr")) ?? null;
}

export function SpeakCoachingButton({ text }: { text: string }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);

    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  function handleToggle() {
    if (!supported || typeof window === "undefined") {
      return;
    }

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      utteranceRef.current = null;
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = pickTurkishVoice(window.speechSynthesis.getVoices());

    utterance.lang = selectedVoice?.lang || "tr-TR";
    utterance.voice = selectedVoice;
    utterance.rate = 1.5;
    utterance.pitch = 1;
    utterance.onend = () => {
      setSpeaking(false);
      utteranceRef.current = null;
    };
    utterance.onerror = () => {
      setSpeaking(false);
      utteranceRef.current = null;
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  if (!supported) {
    return (
      <button className="button-secondary evaluation-speak-button" type="button" disabled>
        Sesli Okuma Yok
      </button>
    );
  }

  return (
    <button className="button-secondary evaluation-speak-button" type="button" onClick={handleToggle}>
      {speaking ? "Okumayi Durdur" : "Notu Sesli Oku"}
    </button>
  );
}
