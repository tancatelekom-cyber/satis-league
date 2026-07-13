"use client";

import { useMemo, useState } from "react";
import { AdminStore } from "@/lib/types";

type SelectableProfile = {
  id: string;
  full_name: string;
  role: string;
  store_name?: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  points: string;
  unit: string;
};

type StoreMultiplierRow = {
  id: string;
  storeName: string;
  multiplier: string;
};

type ParticipantRow = {
  id: string;
  type: "profile" | "group";
  label: string;
  profileId: string;
  memberIds: string[];
};

type DuelBuilderProps = {
  stores: AdminStore[];
  profiles: SelectableProfile[];
};

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function DuelBuilder({ stores, profiles }: DuelBuilderProps) {
  const [products, setProducts] = useState<ProductRow[]>([
    { id: createId("duel-product"), name: "", points: "1", unit: "adet" }
  ]);
  const [storeMultipliers, setStoreMultipliers] = useState<StoreMultiplierRow[]>([
    { id: createId("duel-store"), storeName: "", multiplier: "1" }
  ]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([
    { id: createId("duel-participant"), type: "profile", label: "", profileId: "", memberIds: [] },
    { id: createId("duel-participant"), type: "profile", label: "", profileId: "", memberIds: [] }
  ]);
  const [feedback, setFeedback] = useState("");

  const sortedProfiles = useMemo(
    () => [...profiles].sort((a, b) => a.full_name.localeCompare(b.full_name, "tr")),
    [profiles]
  );

  function updateProduct(id: string, field: keyof ProductRow, value: string) {
    setProducts((current) =>
      current.map((product) => (product.id === id ? { ...product, [field]: value } : product))
    );
  }

  function updateStoreMultiplier(id: string, field: keyof StoreMultiplierRow, value: string) {
    setStoreMultipliers((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }

  function updateParticipant(id: string, field: keyof ParticipantRow, value: string | string[]) {
    setParticipants((current) =>
      current.map((participant) =>
        participant.id === id ? { ...participant, [field]: value } : participant
      )
    );
  }

  function toggleMember(id: string, profileId: string) {
    setParticipants((current) =>
      current.map((participant) => {
        if (participant.id !== id) {
          return participant;
        }

        const hasMember = participant.memberIds.includes(profileId);
        return {
          ...participant,
          memberIds: hasMember
            ? participant.memberIds.filter((item) => item !== profileId)
            : [...participant.memberIds, profileId]
        };
      })
    );
  }

  function addProductRow() {
    setProducts((current) => [
      ...current,
      { id: createId("duel-product"), name: "", points: "1", unit: "adet" }
    ]);
    setFeedback("Yeni duello urunu eklendi.");
  }

  function addStoreMultiplierRow() {
    setStoreMultipliers((current) => [
      ...current,
      { id: createId("duel-store"), storeName: "", multiplier: "1" }
    ]);
    setFeedback("Yeni duello magaza carpani eklendi.");
  }

  function addParticipantRow() {
    setParticipants((current) => [
      ...current,
      { id: createId("duel-participant"), type: "profile", label: "", profileId: "", memberIds: [] }
    ]);
    setFeedback("Yeni duello katilimcisi eklendi.");
  }

  const productsPayload = products
    .map((product) => `${product.name.trim()}|${product.points.trim() || "1"}|${product.unit.trim() || "adet"}`)
    .filter((line) => !line.startsWith("|"))
    .join("\n");

  const storeMultipliersPayload = storeMultipliers
    .map((item) => `${item.storeName.trim()}|${item.multiplier.trim() || "1"}`)
    .filter((line) => !line.startsWith("|"))
    .join("\n");

  const participantsPayload = participants
    .map((participant) => {
      if (participant.type === "profile") {
        const selectedProfile = sortedProfiles.find((profile) => profile.id === participant.profileId);
        if (!selectedProfile) {
          return "";
        }

        return `PROFILE|${selectedProfile.id}|${selectedProfile.full_name}`;
      }

      if (!participant.label.trim() || participant.memberIds.length === 0) {
        return "";
      }

      return `GROUP|${participant.label.trim()}|${participant.memberIds.join(",")}`;
    })
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <div className="field-group">
        <div className="repeater-header">
          <div>
            <span>Duello Katilimcilari</span>
            <small className="repeater-subtitle">{participants.length} satir hazir</small>
          </div>
          <button className="tiny-button approve" onClick={addParticipantRow} type="button">
            Katilimci Ekle
          </button>
        </div>

        <div className="repeater-list">
          {participants.map((participant, index) => (
            <div key={participant.id} className="repeater-row duel-participant-row">
              <label className="field compact">
                <span>Tip</span>
                <select
                  value={participant.type}
                  onChange={(event) =>
                    updateParticipant(participant.id, "type", event.target.value as "profile" | "group")
                  }
                >
                  <option value="profile">Kisi</option>
                  <option value="group">Grup</option>
                </select>
              </label>

              {participant.type === "profile" ? (
                <label className="field compact">
                  <span>Kisi Secimi</span>
                  <select
                    value={participant.profileId}
                    onChange={(event) => updateParticipant(participant.id, "profileId", event.target.value)}
                  >
                    <option value="">Kisi secin</option>
                    {sortedProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.full_name}
                        {profile.store_name ? ` | ${profile.store_name}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="field compact">
                    <span>Grup Adi</span>
                    <input
                      value={participant.label}
                      onChange={(event) => updateParticipant(participant.id, "label", event.target.value)}
                      placeholder="Ornek: Kuzey Takimi"
                    />
                  </label>

                  <div className="field compact">
                    <span>Grup Uyeleri</span>
                    <div className="checkbox-grid permission-checkbox-grid">
                      {sortedProfiles.map((profile) => (
                        <label key={`${participant.id}-${profile.id}`} className="checkbox-card">
                          <input
                            type="checkbox"
                            checked={participant.memberIds.includes(profile.id)}
                            onChange={() => toggleMember(participant.id, profile.id)}
                          />
                          <span>
                            {profile.full_name}
                            {profile.store_name ? ` | ${profile.store_name}` : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="repeater-actions">
                <span>Katilimci #{index + 1}</span>
                <button
                  className="tiny-button"
                  disabled={participants.length <= 2}
                  type="button"
                  onClick={() => {
                    setParticipants((current) => current.filter((item) => item.id !== participant.id));
                    setFeedback("Duello katilimcisi silindi.");
                  }}
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="field-group">
        <div className="repeater-header">
          <div>
            <span>Duello Urunleri</span>
            <small className="repeater-subtitle">{products.length} urun satiri hazir</small>
          </div>
          <button className="tiny-button approve" onClick={addProductRow} type="button">
            Urun Ekle
          </button>
        </div>

        <div className="repeater-list">
          {products.map((product, index) => (
            <div key={product.id} className="repeater-row">
              <label className="field compact">
                <span>Urun Adi</span>
                <input
                  value={product.name}
                  onChange={(event) => updateProduct(product.id, "name", event.target.value)}
                  placeholder="Ornek: Aksesuar Ciro"
                />
              </label>

              <label className="field compact">
                <span>Puan</span>
                <input
                  type="number"
                  min="1"
                  value={product.points}
                  onChange={(event) => updateProduct(product.id, "points", event.target.value)}
                />
              </label>

              <label className="field compact">
                <span>Birim</span>
                <input
                  value={product.unit}
                  onChange={(event) => updateProduct(product.id, "unit", event.target.value)}
                  placeholder="adet"
                />
              </label>

              <div className="repeater-actions">
                <span>Urun #{index + 1}</span>
                <button
                  className="tiny-button"
                  disabled={products.length === 1}
                  type="button"
                  onClick={() => {
                    setProducts((current) => current.filter((item) => item.id !== product.id));
                    setFeedback("Duello urunu silindi.");
                  }}
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="field-group">
        <div className="repeater-header">
          <div>
            <span>Duello Magaza Carpanlari</span>
            <small className="repeater-subtitle">{storeMultipliers.length} magaza satiri hazir</small>
          </div>
          <button className="tiny-button approve" onClick={addStoreMultiplierRow} type="button">
            Magaza Ekle
          </button>
        </div>

        <div className="repeater-list">
          {storeMultipliers.map((item, index) => (
            <div key={item.id} className="repeater-row">
              <label className="field compact">
                <span>Magaza</span>
                <select
                  value={item.storeName}
                  onChange={(event) => updateStoreMultiplier(item.id, "storeName", event.target.value)}
                >
                  <option value="">Magaza secin</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.name}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field compact">
                <span>Carpan</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.multiplier}
                  onChange={(event) => updateStoreMultiplier(item.id, "multiplier", event.target.value)}
                />
              </label>

              <div className="repeater-actions">
                <span>Magaza #{index + 1}</span>
                <button
                  className="tiny-button"
                  disabled={storeMultipliers.length === 1}
                  type="button"
                  onClick={() => {
                    setStoreMultipliers((current) => current.filter((row) => row.id !== item.id));
                    setFeedback("Duello magaza carpani silindi.");
                  }}
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {feedback ? <div className="inline-feedback">{feedback}</div> : null}

      <input name="duelProducts" type="hidden" value={productsPayload} />
      <input name="duelStoreMultipliers" type="hidden" value={storeMultipliersPayload} />
      <input name="duelParticipants" type="hidden" value={participantsPayload} />
    </>
  );
}
