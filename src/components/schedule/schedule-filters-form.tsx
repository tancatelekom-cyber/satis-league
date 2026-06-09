"use client";

import { useRef } from "react";

type StoreOption = {
  id: string;
  name: string;
};

type ScheduleFiltersFormProps = {
  canPickStore: boolean;
  selectedStoreId: string;
  selectedWeek: string;
  stores: StoreOption[];
  weekRangeLabel: string;
};

export function ScheduleFiltersForm({
  canPickStore,
  selectedStoreId,
  selectedWeek,
  stores,
  weekRangeLabel
}: ScheduleFiltersFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null);

  function submitFilters() {
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} className="schedule-filter-form" method="get">
      <label className="schedule-field">
        <span>Hafta secimi</span>
        <input defaultValue={selectedWeek} name="week" type="week" onChange={submitFilters} />
        <small className="schedule-field-hint">{weekRangeLabel}</small>
      </label>

      {canPickStore ? (
        <label className="schedule-field">
          <span>Magaza</span>
          <select defaultValue={selectedStoreId} name="store" onChange={submitFilters}>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input name="store" type="hidden" value={selectedStoreId} />
      )}
    </form>
  );
}
