"use client";

import { useState } from "react";
import { saveGoalTargetAdjustmentsAction } from "@/app/admin/hedef-artisi/actions";
import { calculateAdjustedGoalTarget } from "@/lib/goal-target-adjustments";

export type GoalTargetAdjustmentFormRow = {
  categoryName: string;
  rawTarget: number;
  increasePercent: number;
};

type GoalTargetAdjustmentFormProps = {
  periodMonth: string;
  storeCode: string;
  rows: GoalTargetAdjustmentFormRow[];
};

const NUMBER_FORMATTER = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

function parseRate(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function GoalTargetAdjustmentForm({ periodMonth, storeCode, rows }: GoalTargetAdjustmentFormProps) {
  const [rates, setRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.categoryName, row.increasePercent > 0 ? String(row.increasePercent) : ""]))
  );

  return (
    <form action={saveGoalTargetAdjustmentsAction} className="goal-target-adjustment-form">
      <input type="hidden" name="periodMonth" value={periodMonth} />
      <input type="hidden" name="storeCode" value={storeCode} />

      <div className="goal-target-adjustment-table-wrap">
        <table className="goal-target-adjustment-table">
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Ham hedef</th>
              <th>Artış %</th>
              <th>Eklenecek</th>
              <th>Artışlı hedef</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rateValue = rates[row.categoryName] ?? "";
              const rate = parseRate(rateValue);
              const adjustedTarget = calculateAdjustedGoalTarget(row.rawTarget, rate);
              const targetIncrease = adjustedTarget - row.rawTarget;

              return (
                <tr key={`${storeCode}-${row.categoryName}`}>
                  <th>
                    {row.categoryName}
                    <input type="hidden" name="categoryName" value={row.categoryName} />
                  </th>
                  <td>{NUMBER_FORMATTER.format(row.rawTarget)}</td>
                  <td>
                    <label className="goal-target-adjustment-rate">
                      <input
                        aria-label={`${storeCode} ${row.categoryName} artış yüzdesi`}
                        min="0"
                        max="1000"
                        name="increasePercent"
                        step="0.01"
                        type="number"
                        inputMode="decimal"
                        value={rateValue}
                        onChange={(event) =>
                          setRates((current) => ({ ...current, [row.categoryName]: event.target.value }))
                        }
                      />
                      <span>%</span>
                    </label>
                  </td>
                  <td className={targetIncrease > 0 ? "goal-target-adjustment-added" : ""}>
                    {targetIncrease > 0 ? `+${NUMBER_FORMATTER.format(targetIncrease)}` : "-"}
                  </td>
                  <td><strong>{NUMBER_FORMATTER.format(adjustedTarget)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="goal-target-adjustment-actions">
        <span>0 veya boş bıraktığınız kategorinin artış ayarı kaldırılır.</span>
        <button className="button-primary" type="submit">Şube Artışlarını Kaydet</button>
      </div>
    </form>
  );
}
