"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type TariffSearchNavProps = {
  bucket?: string;
  mode: string;
  placeholder?: string;
  preset: string;
  search: string;
};

function buildHref(mode: string, preset: string, bucket?: string, search?: string) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (preset && preset !== "all") params.set("preset", preset);
  if (bucket) params.set("bucket", bucket);
  if (search) params.set("search", search);
  return `/tarifeler?${params.toString()}`;
}

export function TariffSearchNav({
  bucket,
  mode,
  placeholder = "Tarife adina gore ara",
  preset,
  search
}: TariffSearchNavProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(search);
  const lastCommittedSearchRef = useRef(search);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const isFocused = document.activeElement === inputRef.current;

    if (!isFocused) {
      setValue(search);
    }

    lastCommittedSearchRef.current = search;
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = value.trim();

      if (normalized === lastCommittedSearchRef.current) {
        return;
      }

      lastCommittedSearchRef.current = normalized;

      startTransition(() => {
        router.replace(buildHref(mode, preset, bucket, normalized), { scroll: false });
      });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [bucket, mode, preset, router, value]);

  return (
    <label className="tariff-live-search">
      <span className="sr-only">Tarife arama</span>
      <input
        aria-label="Tarife arama"
        className="input tariff-live-search-input"
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        ref={inputRef}
        type="search"
        value={value}
      />
    </label>
  );
}
