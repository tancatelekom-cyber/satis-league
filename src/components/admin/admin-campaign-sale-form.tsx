"use client";

import { useMemo, useState } from "react";

type CampaignSaleFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  campaigns: Array<{
    id: string;
    name: string;
    mode: "employee" | "store";
    products: Array<{
      id: string;
      name: string;
      base_points: number;
      unit_label: string;
    }>;
  }>;
  employees: Array<{
    id: string;
    full_name: string;
  }>;
  stores: Array<{
    id: string;
    name: string;
  }>;
};

export function AdminCampaignSaleForm({
  action,
  campaigns,
  employees,
  stores
}: CampaignSaleFormProps) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id ?? "");

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  );

  return (
    <form action={action} className="admin-form">
      <input name="redirectTo" type="hidden" value="/admin/kampanyalar" />

      <div className="auth-grid">
        <label className="field compact">
          <span>Kampanya</span>
          <select
            name="campaignId"
            required
            value={selectedCampaignId}
            onChange={(event) => setSelectedCampaignId(event.target.value)}
          >
            <option value="">Kampanya secin</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name} - {campaign.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"}
              </option>
            ))}
          </select>
        </label>

        <label className="field compact">
          <span>Urun</span>
          <select name="productId" required>
            <option value="">Urun secin</option>
            {(selectedCampaign?.products ?? []).map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.base_points} {product.unit_label})
              </option>
            ))}
          </select>
        </label>

        {selectedCampaign?.mode === "store" ? (
          <label className="field compact">
            <span>Hedef Magaza</span>
            <select name="targetStoreId" required>
              <option value="">Magaza secin</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field compact">
            <span>Hedef Personel</span>
            <select name="targetProfileId" required>
              <option value="">Personel secin</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field compact">
          <span>Miktar</span>
          <input defaultValue="1" name="quantity" required type="number" />
        </label>
      </div>

      <p className="subtle">
        {selectedCampaign
          ? selectedCampaign.mode === "employee"
            ? "Bu kampanyada satis secilen personele yazilir."
            : "Bu kampanyada satis secilen magazaya yazilir."
          : "Once kampanya secin, sonra hedef personel veya magazayi belirleyin."}
      </p>

      <div className="campaign-manage-actions">
        <button className="button-primary" type="submit">
          Admin Satis Gir
        </button>
      </div>
    </form>
  );
}
