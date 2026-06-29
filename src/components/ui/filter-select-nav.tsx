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
      <div className="filter-select-value">{selectedOption?.label ?? ""}</div>
      <i className="filter-select-icon" aria-hidden="true">
        v
      </i>
      <select
        aria-label={ariaLabel}
        className="filter-select"
        value={value}
        onChange={(event) => {
          router.replace(event.target.value, { scroll: false });
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
