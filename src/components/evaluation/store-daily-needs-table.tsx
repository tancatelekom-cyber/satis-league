"use client";

import { Fragment, useState } from "react";

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

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  });
}

function renderNeedValue(value: number | null | undefined) {
  return value !== null && value !== undefined && value <= 0 ? "Tamamlandi" : formatNumber(value);
}

export function StoreDailyNeedsTable({ rows }: StoreDailyNeedsTableProps) {
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);

  function toggleGroup(groupKey: string) {
    setOpenKeys((current) =>
      current.includes(groupKey) ? current.filter((item) => item !== groupKey) : [...current, groupKey]
    );
  }

  function toggleRow(rowKey: string) {
    setExpandedRows((current) =>
      current.includes(rowKey) ? current.filter((item) => item !== rowKey) : [...current, rowKey]
    );
  }

  return (
    <div className="goal-company-trend-table-wrap company-daily-needs-table-wrap">
      <table className="goal-company-trend-table company-daily-needs-table">
        <thead>
          <tr>
            <th>Kategori</th>
            <th>%100</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.level > 0 && !openKeys.includes(row.groupKey)) {
              return null;
            }

            const rowKey = `${row.groupKey}-${row.title}`;
            const isOpen = openKeys.includes(row.groupKey);
            const isExpanded = expandedRows.includes(rowKey);
            const defaultCell = row.cells.find((item) => item.threshold === 100);

            return (
              <Fragment key={`store-daily-needs-row-${rowKey}`}>
                <tr className={row.level > 0 ? "goal-company-trend-child-row" : ""}>
                  <th>
                    <button
                      type="button"
                      className="goal-company-trend-toggle"
                      onClick={() => {
                        if (row.hasChildren) {
                          toggleGroup(row.groupKey);
                        }
                        toggleRow(rowKey);
                      }}
                    >
                      <span
                        className={`goal-company-trend-arrow ${
                          row.hasChildren ? (isOpen ? "goal-company-trend-arrow-open" : "") : isExpanded ? "goal-company-trend-arrow-open" : ""
                        }`}
                        aria-hidden="true"
                      >
                        v
                      </span>
                      <span className={row.level > 0 ? "goal-company-trend-label-child" : undefined}>
                        {row.title}
                      </span>
                    </button>
                  </th>
                  <td className={(defaultCell?.dailyRequired ?? 0) <= 0 ? "goal-company-trend-good" : ""}>
                    {renderNeedValue(defaultCell?.dailyRequired)}
                  </td>
                </tr>

                {isExpanded ? (
                  <tr className="company-daily-needs-detail-row">
                    <td colSpan={2}>
                      <div className="company-daily-needs-detail-wrap">
                        <table className="company-daily-needs-detail-table">
                          <thead>
                            <tr>
                              <th>Skala</th>
                              <th>Gunluk Ihtiyac</th>
                            </tr>
                          </thead>
                          <tbody>
                            {THRESHOLDS.map((threshold) => {
                              const cell = row.cells.find((item) => item.threshold === threshold);
                              const isComplete = (cell?.dailyRequired ?? 0) <= 0;

                              return (
                                <tr key={`store-detail-row-${rowKey}-${threshold}`}>
                                  <th>%{threshold}</th>
                                  <td className={isComplete ? "goal-company-trend-good" : ""}>
                                    {renderNeedValue(cell?.dailyRequired)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
