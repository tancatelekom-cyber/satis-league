"use client";

import { useMemo, useState } from "react";
import {
  calculatePosGrossAmount,
  formatPosAmountInput,
  formatPosCurrency,
  formatPosPercent,
  normalizePosCommissionPercent,
  parsePosAmountInput
} from "@/lib/pos-commission";

type PosCommissionCalculatorProps = {
  commissionPercent: number;
};

export function PosCommissionCalculator({
  commissionPercent
}: PosCommissionCalculatorProps) {
  const [amountInput, setAmountInput] = useState("");
  const [selectedCommissionPercent, setSelectedCommissionPercent] = useState(
    normalizePosCommissionPercent(commissionPercent)
  );

  const amount = useMemo(() => parsePosAmountInput(amountInput), [amountInput]);
  const grossAmount = useMemo(
    () => calculatePosGrossAmount(amount, selectedCommissionPercent),
    [amount, selectedCommissionPercent]
  );

  function updateCommission(nextValue: number) {
    setSelectedCommissionPercent(normalizePosCommissionPercent(nextValue));
  }

  return (
    <section
      style={{
        display: "grid",
        gap: 18
      }}
    >
      <section
        className="campaign-section-card"
        style={{
          display: "grid",
          gap: 14,
          padding: "20px"
        }}
      >
        <label
          style={{
            display: "grid",
            gap: 10
          }}
        >
          <span
            style={{
              color: "#0b2143",
              fontWeight: 800,
              fontSize: "0.98rem"
            }}
          >
            Net Gecmesi Istenen Tutar
          </span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Tutar girin"
            value={amountInput}
            onChange={(event) => setAmountInput(formatPosAmountInput(event.target.value))}
            style={{
              width: "100%",
              minHeight: 60,
              borderRadius: 22,
              border: "1px solid rgba(4, 92, 96, 0.18)",
              background: "#ffffff",
              color: "#0b2143",
              padding: "16px 18px",
              fontSize: "1.45rem",
              fontWeight: 800,
              outline: "none",
              boxSizing: "border-box"
            }}
          />
        </label>

        <article
          style={{
            borderRadius: 28,
            padding: "18px 20px",
            background: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(4, 92, 96, 0.16)",
            boxShadow: "0 16px 28px rgba(8, 22, 40, 0.08)",
            display: "grid",
            gap: 6
          }}
        >
          <span
            style={{
              color: "#56708c",
              fontWeight: 700
            }}
        >
          Tanimli Komisyon
        </span>
          <strong
            style={{
              color: "#0b2143",
              fontSize: "2rem",
              lineHeight: 1
            }}
          >
            {formatPosPercent(selectedCommissionPercent)}
          </strong>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "56px minmax(0, 1fr) 56px",
              gap: 10,
              alignItems: "center",
              marginTop: 6
            }}
          >
            <button
              type="button"
              onClick={() => updateCommission(selectedCommissionPercent - 1)}
              aria-label="Komisyon oranini azalt"
              style={{
                minHeight: 50,
                borderRadius: 18,
                border: "1px solid rgba(4, 92, 96, 0.18)",
                background: "rgba(8, 32, 50, 0.06)",
                color: "#0b2143",
                fontSize: "1.7rem",
                fontWeight: 900,
                cursor: "pointer"
              }}
            >
              -
            </button>

            <div
              style={{
                minHeight: 50,
                borderRadius: 18,
                border: "1px solid rgba(4, 92, 96, 0.14)",
                background: "rgba(4, 92, 96, 0.08)",
                color: "#0b2143",
                display: "grid",
                placeItems: "center",
                fontSize: "1.05rem",
                fontWeight: 900
              }}
            >
              {formatPosPercent(selectedCommissionPercent)}
            </div>

            <button
              type="button"
              onClick={() => updateCommission(selectedCommissionPercent + 1)}
              aria-label="Komisyon oranini artir"
              style={{
                minHeight: 50,
                borderRadius: 18,
                border: "1px solid rgba(4, 92, 96, 0.18)",
                background: "rgba(8, 32, 50, 0.06)",
                color: "#0b2143",
                fontSize: "1.7rem",
                fontWeight: 900,
                cursor: "pointer"
              }}
            >
              +
            </button>
          </div>
        </article>
      </section>

      <article
        className="campaign-section-card"
        style={{
          borderRadius: 34,
          padding: "24px 24px 26px",
          background: "linear-gradient(135deg, rgba(8, 32, 50, 0.96), rgba(16, 115, 124, 0.9))",
          boxShadow: "0 24px 40px rgba(8, 22, 40, 0.2)",
          border: "1px solid rgba(129, 230, 217, 0.2)",
          display: "grid",
          gap: 12
        }}
      >
        <span
          style={{
            color: "rgba(220, 252, 231, 0.88)",
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontSize: "0.92rem"
          }}
        >
          Karttan Cekilecek Tutar
        </span>
        <strong
          style={{
            color: "#f8fafc",
            fontSize: "clamp(2rem, 5vw, 3.5rem)",
            lineHeight: 1,
            fontWeight: 900
          }}
        >
          {formatPosCurrency(grossAmount)}
        </strong>
      </article>
    </section>
  );
}
