"use client";

import { useMemo, useState } from "react";
import {
  calculatePosCommissionAmount,
  calculatePosNetAmount,
  formatPosCurrency,
  formatPosPercent,
  parsePosAmountInput
} from "@/lib/pos-commission";

type PosCommissionCalculatorProps = {
  commissionPercent: number;
};

export function PosCommissionCalculator({
  commissionPercent
}: PosCommissionCalculatorProps) {
  const [amountInput, setAmountInput] = useState("");

  const amount = useMemo(() => parsePosAmountInput(amountInput), [amountInput]);
  const netAmount = useMemo(
    () => calculatePosNetAmount(amount, commissionPercent),
    [amount, commissionPercent]
  );
  const commissionAmount = useMemo(
    () => calculatePosCommissionAmount(amount, commissionPercent),
    [amount, commissionPercent]
  );

  return (
    <section
      className="campaign-section-card"
      style={{
        display: "grid",
        gap: 20
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 8
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "1.8rem",
            color: "#0b2143",
            fontWeight: 900
          }}
        >
          Kredi Karti POS Komisyon Hesaplayici
        </h2>
        <p
          style={{
            margin: 0,
            color: "#37516f",
            fontSize: "1rem",
            lineHeight: 1.7
          }}
        >
          Cekilen tutari girin. Tanimli POS komisyonuna gore net gececek tutar otomatik hesaplanir.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16
        }}
      >
        <label
          className="field"
          style={{
            display: "grid",
            gap: 10
          }}
        >
          <span
            style={{
              color: "#0b2143",
              fontWeight: 800,
              fontSize: "1rem"
            }}
          >
            Cekilen Tutar
          </span>
          <input
            className="input"
            inputMode="decimal"
            placeholder="Ornek: 12.500"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            style={{
              fontSize: "1.3rem",
              fontWeight: 800
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
            {formatPosPercent(commissionPercent)}
          </strong>
          <span
            style={{
              color: "#37516f"
            }}
          >
            Formul: Cekilen Tutar x (1 - Komisyon / 100)
          </span>
        </article>
      </div>

      <article
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
          Komisyonlu Net Tutar
        </span>
        <strong
          style={{
            color: "#f8fafc",
            fontSize: "clamp(2rem, 5vw, 3.5rem)",
            lineHeight: 1,
            fontWeight: 900
          }}
        >
          {formatPosCurrency(netAmount)}
        </strong>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 22,
              background: "rgba(255,255,255,0.1)",
              color: "#e2e8f0",
              display: "grid",
              gap: 4
            }}
          >
            <span style={{ fontWeight: 700, opacity: 0.82 }}>Kesilecek Komisyon</span>
            <strong style={{ fontSize: "1.35rem", color: "#fef3c7" }}>
              {formatPosCurrency(commissionAmount)}
            </strong>
          </div>
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 22,
              background: "rgba(255,255,255,0.1)",
              color: "#e2e8f0",
              display: "grid",
              gap: 4
            }}
          >
            <span style={{ fontWeight: 700, opacity: 0.82 }}>Brut Tutar</span>
            <strong style={{ fontSize: "1.35rem", color: "#d1fae5" }}>
              {formatPosCurrency(amount)}
            </strong>
          </div>
        </div>
      </article>
    </section>
  );
}
