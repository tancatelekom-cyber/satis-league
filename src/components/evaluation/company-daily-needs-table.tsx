"use client";

import { Fragment, useState } from "react";

type CompanyDailyNeedsTableCell = {
  threshold: number;
  dailyRequired: number;
};

type CompanyDailyNeedsTableRow = {
  title: string;
  groupKey: string;
  rowKey: string;
  level: number;
  hasChildren: boolean;
  cells: CompanyDailyNeedsTableCell[];
  stores: Array<{
    storeCode: string;
    cells: CompanyDailyNeedsTableCell[];
  }>;
};

type CompanyDailyNeedsTableProps = {
  rows: CompanyDailyNeedsTableRow[];
  visibleTrendStoreCodes: string[];
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

export function CompanyDailyNeedsTable({
  rows,
  visibleTrendStoreCodes
}: CompanyDailyNeedsTableProps) {
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
            const isExpanded = expandedRows.includes(row.rowKey);
            const defaultCell = row.cells.find((item) => item.threshold === 100);

            return (
              <Fragment key={`daily-need-row-${row.rowKey}`}>
                <tr className={row.level > 0 ? "goal-company-trend-child-row" : ""}>
                  <th>
                    <button
                      type="button"
                      className="goal-company-trend-toggle"
                      onClick={() => {
                        if (row.hasChildren) {
                          toggleGroup(row.groupKey);
                        }
                        toggleRow(row.rowKey);
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
                      <span
                        className={
                          row.level > 0 ? "goal-company-trend-label-child" : undefined
                        }
                      >
                        {row.title}
                      </span>
                    </button>
                  </th>

                  {visibleTrendStoreCodes.map((storeCode) => {
                    const store = row.stores.find((item) => item.storeCode === storeCode);
                    const storeDefaultCell = store?.cells.find((item) => item.threshold === 100);
                    const isComplete = (storeDefaultCell?.dailyRequired ?? 0) <= 0;

                    return (
                      <td
                        key={`daily-need-${row.rowKey}-${storeCode}`}
                        className={isComplete ? "goal-company-trend-good" : ""}
                      >
                        {renderNeedValue(storeDefaultCell?.dailyRequired)}
                      </td>
                    );
                  })}

                  <td className={(defaultCell?.dailyRequired ?? 0) <= 0 ? "goal-company-trend-company goal-company-trend-good" : "goal-company-trend-company"}>
                    {renderNeedValue(defaultCell?.dailyRequired)}
                  </td>
                </tr>

                {isExpanded ? (
                  <tr className="company-daily-needs-detail-row">
                    <td colSpan={visibleTrendStoreCodes.length + 2}>
                      <div className="company-daily-needs-detail-wrap">
                        <table className="company-daily-needs-detail-table">
                          <thead>
                            <tr>
                              <th>Skala</th>
                              {visibleTrendStoreCodes.map((storeCode) => (
                                <th key={`detail-head-${row.rowKey}-${storeCode}`}>{storeCode}</th>
                              ))}
                              <th>Firma</th>
                            </tr>
                          </thead>
                          <tbody>
                            {THRESHOLDS.map((threshold) => {
                              const companyCell = row.cells.find((item) => item.threshold === threshold);
                              const companyComplete = (companyCell?.dailyRequired ?? 0) <= 0;

                              return (
                                <tr key={`detail-row-${row.rowKey}-${threshold}`}>
                                  <th>%{threshold}</th>
                                  {visibleTrendStoreCodes.map((storeCode) => {
                                    const store = row.stores.find((item) => item.storeCode === storeCode);
                                    const cell = store?.cells.find((item) => item.threshold === threshold);
                                    const isComplete = (cell?.dailyRequired ?? 0) <= 0;

                                    return (
                                      <td
                                        key={`detail-cell-${row.rowKey}-${storeCode}-${threshold}`}
                                        className={isComplete ? "goal-company-trend-good" : ""}
                                      >
                                        {renderNeedValue(cell?.dailyRequired)}
                                      </td>
                                    );
                                  })}
                                  <td className={companyComplete ? "goal-company-trend-company goal-company-trend-good" : "goal-company-trend-company"}>
                                    {renderNeedValue(companyCell?.dailyRequired)}
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
