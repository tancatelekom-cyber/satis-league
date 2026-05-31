"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

const STORAGE_KEYS = {
  voice: "evaluation-speech-voice"
} as const;

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

function buildSpeechText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();

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
  const [selectedVoiceUri, setSelectedVoiceUri] = useState("");
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

    const savedVoice = window.localStorage.getItem(STORAGE_KEYS.voice) ?? "";

    if (savedVoice) {
      setSelectedVoiceUri(savedVoice);
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

  useEffect(() => {
    if (!supported || typeof window === "undefined") {
      return;
    }

    if (selectedVoiceUri) {
      return;
    }

    const preferredVoice = pickBestTurkishVoice(voices);
    if (!preferredVoice) {
      return;
    }

    setSelectedVoiceUri(preferredVoice.voiceURI);
    window.localStorage.setItem(STORAGE_KEYS.voice, preferredVoice.voiceURI);
  }, [supported, selectedVoiceUri, voices]);

  function handleVoiceChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextValue = event.target.value;
    setSelectedVoiceUri(nextValue);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEYS.voice, nextValue);
    }
  }

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

    const selectedVoice =
      turkishVoices.find((voice) => voice.voiceURI === selectedVoiceUri) ?? pickBestTurkishVoice(voices) ?? null;
    const utterance = new SpeechSynthesisUtterance(buildSpeechText(text));

    utterance.lang = selectedVoice?.lang || "tr-TR";
    utterance.voice = selectedVoice;
    utterance.rate = 1.35;
    utterance.pitch = 1.1;
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
    <div className="evaluation-speech-controls">
      <label className="evaluation-speech-field">
        <span>Ses</span>
        <select className="evaluation-speech-select" value={selectedVoiceUri} onChange={handleVoiceChange}>
          {turkishVoices.length ? (
            turkishVoices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name}
              </option>
            ))
          ) : (
            <option value="">Varsayilan Turkce Ses</option>
          )}
        </select>
      </label>

      <button className="button-secondary evaluation-speak-button" type="button" onClick={handleToggle}>
        {speaking ? "Okumayi Durdur" : "Sesli Oku"}
      </button>
    </div>
  );
}
