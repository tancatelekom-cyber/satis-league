"use client";

import { useState } from "react";
import { submitSaleEntryAction } from "@/app/kampanyalar/actions";
import { CampaignMode, ScoringType } from "@/lib/types";

type TeamProfileOption = {
  id: string;
  full_name: string;
};

type SaleEntryCardProps = {
  campaignId: string;
  campaignMode: CampaignMode;
  scoring: ScoringType;
  product: {
    id: string;
    name: string;
    unit_label: string;
    base_points: number;
  };
  defaultProfileId: string;
  defaultStoreId: string | null;
  isManager: boolean;
  teamProfiles: TeamProfileOption[];
  redirectTo?: string;
};

const quickAdds = [-10, -5, -1, 1, 5, 10];

export function SaleEntryCard({
  campaignId,
  campaignMode,
  scoring,
  product,
  defaultProfileId,
  defaultStoreId,
  isManager,
  teamProfiles,
  redirectTo
}: SaleEntryCardProps) {
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  function changeQuantity(nextValue: number) {
    if (submitting) {
      return;
    }

    setQuantity(nextValue);
  }

  const projectedScore =
    scoring === "points" ? quantity * Number(product.base_points ?? 1) : quantity;

  return (
    <article className="product-card product-card-game">
      <div className="product-header">
        <div>
          <h3>{product.name}</h3>
          <p className="product-meta">
            Birim: {product.unit_label} | Baz puan: {product.base_points}
          </p>
        </div>
        <div className="status-chip">Turbo giris</div>
      </div>

      <div className="product-energy-bar">
        <span>Bu islem</span>
        <strong>
          {projectedScore} {scoring === "points" ? "puan" : product.unit_label}
        </strong>
      </div>

      <form
        action={submitSaleEntryAction}
        className="sale-form"
        onSubmit={() => {
          setSubmitting(true);
        }}
      >
        <input name="campaignId" type="hidden" value={campaignId} />
        <input name="productId" type="hidden" value={product.id} />
        <input name="quantity" type="hidden" value={quantity} />
        <input
          name="successRedirectTo"
          type="hidden"
          value={`/kampanyalar/${campaignId}?view=leaderboard`}
        />
        <input
          name="errorRedirectTo"
          type="hidden"
          value={redirectTo ?? `/kampanyalar/${campaignId}?view=sales`}
        />

        {campaignMode === "store" ? (
          <input name="targetStoreId" type="hidden" value={defaultStoreId ?? ""} />
        ) : null}

        {campaignMode === "employee" && isManager ? (
          <label className="field compact">
            <span>Hedef Personel</span>
            <select defaultValue={defaultProfileId} name="targetProfileId">
              {teamProfiles.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input name="targetProfileId" type="hidden" value={defaultProfileId} />
        )}

        <div className="quantity-hud">
          <span className="subtle">Miktar sec. Eksi deger dusum islemi yapar.</span>

          <div className="counter-row game-counter-row">
            <button
              className="counter-button"
              disabled={submitting}
              onClick={() => changeQuantity(quantity - 1)}
              type="button"
            >
              -
            </button>
            <div className="counter-value game-counter-value">{quantity}</div>
            <button
              className="counter-button"
              disabled={submitting}
              onClick={() => changeQuantity(quantity + 1)}
              type="button"
            >
              +
            </button>
          </div>

          <div className="quick-add-row">
            {quickAdds.map((amount) => (
              <button
                key={amount}
                className="quick-add-chip"
                disabled={submitting}
                onClick={() => changeQuantity(quantity + amount)}
                type="button"
              >
                {amount > 0 ? `+${amount}` : amount}
              </button>
            ))}
          </div>
        </div>

        <div className="action-row">
          <button className="button-primary" disabled={submitting} type="submit">
            {submitting ? "Isleniyor..." : "Satisi Isle"}
          </button>
        </div>
      </form>
    </article>
  );
}
