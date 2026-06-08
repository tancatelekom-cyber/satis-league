"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function isTurkishVoice(voice: SpeechSynthesisVoice) {
  return voice.lang.toLocaleLowerCase("tr-TR").startsWith("tr");
}

function scoreVoice(voice: SpeechSynthesisVoice) {
  const name = voice.name.toLocaleLowerCase("tr-TR");
  let score = 0;

  if (isTurkishVoice(voice)) score += 100;
  if (voice.default) score += 12;
  if (name.includes("microsoft")) score += 10;
  if (name.includes("google")) score += 7;
  if (name.includes("turkish") || name.includes("türkçe")) score += 8;
  if (name.includes("natural") || name.includes("neural") || name.includes("online")) score += 14;
  if (name.includes("female") || name.includes("kadın")) score += 3;

  return score;
}

function pickBestTurkishVoice(voices: SpeechSynthesisVoice[]) {
  return [...voices]
    .filter(isTurkishVoice)
    .sort((left, right) => scoreVoice(right) - scoreVoice(left))[0] ?? null;
}

const TURKISH_SPEECH_FIXES: Array<[string, string]> = [
  ["altindasin", "altındasın"],
  ["altinda", "altında"],
  ["ayni", "aynı"],
  ["bugun", "bugün"],
  ["calisan", "çalışan"],
  ["firmanin", "firmanın"],
  ["firma", "firma"],
  ["gorecegin", "göreceğin"],
  ["gorunmuyor", "görünmüyor"],
  ["gozden", "gözden"],
  ["gun", "gün"],
  ["gunde", "günde"],
  ["gunlerde", "günlerde"],
  ["gunluk", "günlük"],
  ["için", "için"],
  ["icin", "için"],
  ["ihtiyac", "ihtiyaç"],
  ["kacirdigin", "kaçırdığın"],
  ["kaldiği", "kaldığı"],
  ["kaldigi", "kaldığı"],
  ["kaldigin", "kaldığın"],
  ["kalir", "kalır"],
  ["koruyalim", "koruyalım"],
  ["lazim", "lazım"],
  ["magaza", "mağaza"],
  ["minimum", "minimum"],
  ["ortalamasi", "ortalaması"],
  ["ortalamasinin", "ortalamasının"],
  ["gerceklesen", "gerçekleşen"],
  ["gercekleseni", "gerçekleşeni"],
  ["sube", "şube"],
  ["uretim", "üretim"],
  ["uretmen", "üretmen"],
  ["urun", "ürün"],
  ["yonlendirme", "yönlendirme"],
  ["yuzde", "yüzde"]
];

function matchCase(source: string, replacement: string) {
  if (source === source.toLocaleUpperCase("tr-TR")) {
    return replacement.toLocaleUpperCase("tr-TR");
  }

  if (source[0] === source[0]?.toLocaleUpperCase("tr-TR")) {
    return `${replacement[0]?.toLocaleUpperCase("tr-TR") ?? ""}${replacement.slice(1)}`;
  }

  return replacement;
}

function normalizeTurkishSpeech(text: string) {
  return TURKISH_SPEECH_FIXES.reduce((current, [search, replacement]) => {
    const pattern = new RegExp(`\\b${search}\\b`, "giu");
    return current.replace(pattern, (match) => matchCase(match, replacement));
  }, text);
}

function buildSpeechText(text: string) {
  const normalized = normalizeTurkishSpeech(text).replace(/\s+/g, " ").trim();

  return normalized
    .replace(/:\s*/g, ". ")
    .replace(/%/g, " yüzde ")
    .replace(/-\s+/g, "")
    .replace(/\.\s+/g, ". ")
    .replace(/,\s+/g, ", ");
}

export function SpeakCoachingButton({ text }: { text: string }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const turkishVoices = useMemo(
    () => [...voices].filter(isTurkishVoice).sort((left, right) => scoreVoice(right) - scoreVoice(left)),
    [voices]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const available = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    setSupported(available);

    if (!available) {
      return;
    }

    const loadVoices = () => {
      const nextVoices = window.speechSynthesis.getVoices();
      setVoices(nextVoices);
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.cancel();
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
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

    const selectedVoice = turkishVoices[0] ?? pickBestTurkishVoice(voices) ?? null;
    const utterance = new SpeechSynthesisUtterance(buildSpeechText(text));

    utterance.lang = "tr-TR";
    if (selectedVoice && isTurkishVoice(selectedVoice)) {
      utterance.voice = selectedVoice;
    }
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
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
      {speaking ? "Okumayı Durdur" : "Sesli Oku"}
    </button>
  );
}
