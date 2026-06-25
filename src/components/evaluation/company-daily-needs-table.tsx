"use client";

import { useMemo, useState } from "react";

type CompanyDailyNeedsTableRow = {
  title: string;
  groupKey: string;
  level: number;
  hasChildren: boolean;
  companyDailyNeed: number | null;
  stores: Array<{
    storeCode: string;
    dailyNeed: number | null;
  }>;
};

type CompanyDailyNeedsTableProps = {
  rows: CompanyDailyNeedsTableRow[];
  visibleTrendStoreCodes: string[];
  formatNumber: (value: number | null | undefined) => string;
};

export function CompanyDailyNeedsTable({
  rows,
  visibleTrendStoreCodes,
  formatNumber
}: CompanyDailyNeedsTableProps) {
  const parentKeys = useMemo(
    () => rows.filter((row) => row.level === 0 && row.hasChildren).map((row) => row.groupKey),
    [rows]
  );
  const [openKeys, setOpenKeys] = useState<string[]>(parentKeys);

  function toggleGroup(groupKey: string) {
    setOpenKeys((current) =>
      current.includes(groupKey) ? current.filter((item) => item !== groupKey) : [...current, groupKey]
    );
  }

  return (
    <div className="goal-company-trend-table-wrap">
      <table className="goal-company-trend-table">
        <thead>
          <tr>
            <th>Kategori</th>
            {visibleTrendStoreCodes.map((storeCode) => (
              <th key={`daily-need-head-${storeCode}`}>{storeCode}</th>
            ))}
            <th>Firma</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.level > 0 && !openKeys.includes(row.groupKey)) {
              return null;
            }

            const isOpen = openKeys.includes(row.groupKey);

            return (
              <tr
                key={`daily-need-row-${row.groupKey}-${row.title}`}
                className={row.level > 0 ? "goal-company-trend-child-row" : ""}
              >
                <th>
                  {row.hasChildren ? (
                    <button
                      type="button"
                      className="goal-company-trend-toggle"
                      onClick={() => toggleGroup(row.groupKey)}
                    >
                      <span
                        className={`goal-company-trend-arrow ${isOpen ? "goal-company-trend-arrow-open" : ""}`}
                        aria-hidden="true"
                      >
                        v
                      </span>
                      <span>{row.title}</span>
                    </button>
                  ) : (
                    <span
                      className={
                        row.level > 0
                          ? "goal-company-trend-label goal-company-trend-label-child"
                          : "goal-company-trend-label"
                      }
                    >
                      <span>{row.title}</span>
                    </span>
                  )}
                </th>
                {visibleTrendStoreCodes.map((storeCode) => {
                  const store = row.stores.find((item) => item.storeCode === storeCode);

                  return (
                    <td key={`daily-need-${row.groupKey}-${row.title}-${storeCode}`}>
                      {formatNumber(store?.dailyNeed)}
                    </td>
                  );
                })}
                <td className="goal-company-trend-company">{formatNumber(row.companyDailyNeed)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
