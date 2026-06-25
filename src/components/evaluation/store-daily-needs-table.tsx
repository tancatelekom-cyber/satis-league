"use client";

import { useState } from "react";

type StoreDailyNeedsTableCell = {
  threshold: number;
  dailyRequired: number;
};

type StoreDailyNeedsTableRow = {
  title: string;
  groupKey: string;
  level: number;
  hasChildren: boolean;
  cells: StoreDailyNeedsTableCell[];
};

type StoreDailyNeedsTableProps = {
  rows: StoreDailyNeedsTableRow[];
};

const THRESHOLDS = [80, 90, 100, 110, 120];

function formatNumber(value: number) {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  });
}

export function StoreDailyNeedsTable({ rows }: StoreDailyNeedsTableProps) {
  const [openKeys, setOpenKeys] = useState<string[]>([]);

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
            {THRESHOLDS.map((threshold) => (
              <th key={`store-daily-needs-head-${threshold}`}>%{threshold}</th>
            ))}
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
                key={`store-daily-needs-row-${row.groupKey}-${row.title}`}
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

                {THRESHOLDS.map((threshold) => {
                  const cell = row.cells.find((item) => item.threshold === threshold);
                  const isComplete = (cell?.dailyRequired ?? 0) <= 0;

                  return (
                    <td
                      key={`store-daily-needs-cell-${row.groupKey}-${row.title}-${threshold}`}
                      className={isComplete ? "goal-company-trend-good" : ""}
                    >
                      {isComplete ? "Tamam" : formatNumber(cell?.dailyRequired ?? 0)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
