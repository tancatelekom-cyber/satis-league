"use client";

import { useRouter } from "next/navigation";

type FilterOption = {
  label: string;
  value: string;
};

type FilterSelectNavProps = {
  ariaLabel: string;
  options: FilterOption[];
  value: string;
};

export function FilterSelectNav({ ariaLabel, options, value }: FilterSelectNavProps) {
  const router = useRouter();
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <label className="filter-select-shell">
      <span className="sr-only">{ariaLabel}</span>
      <span className="filter-select-value">{selectedOption?.label ?? ""}</span>
      <span className="filter-select-icon" aria-hidden="true">
        v
      </span>
      <select
        aria-label={ariaLabel}
        className="filter-select"
        value={value}
        onChange={(event) => {
          router.push(event.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
