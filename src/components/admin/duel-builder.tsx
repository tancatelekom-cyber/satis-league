"use client";

import { useMemo, useState } from "react";
import { AdminStore } from "@/lib/types";

type SelectableProfile = {
  id: string;
  full_name: string;
  role: string;
  store_name: string | null;
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
  profileId: string;
  label: string;
  memberIds: string[];
  matchupNo: number;
  side: 1 | 2;
  winnerDescription: string;
  loserDescription: string;
};

type DuelBuilderProps = {
  stores: AdminStore[];
  profiles: SelectableProfile[];
  initialValues?: {
    products: Array<{
      id: string;
      name: string;
      base_points: number;
      unit_label: string;
    }>;
    storeMultipliers: Array<{ storeName: string; multiplier: number }>;
    participants: Array<{
      id: string;
      type: "profile" | "group";
      profileId: string;
      label: string;
      memberIds: string[];
      matchupNo: number;
      winnerDescription: string;
      loserDescription: string;
    }>;
  };
};

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createParticipantRow(matchupNo: number, side: 1 | 2): ParticipantRow {
  return {
    id: createId("participant"),
    type: "profile",
    profileId: "",
    label: "",
    memberIds: [],
    matchupNo,
    side,
    winnerDescription: "",
    loserDescription: ""
  };
}

export function DuelBuilder({ stores, profiles, initialValues }: DuelBuilderProps) {
  const [products, setProducts] = useState<ProductRow[]>(() =>
    initialValues?.products.length
      ? initialValues.products.map((product) => ({
          id: product.id,
          name: product.name,
          points: String(product.base_points),
          unit: product.unit_label
        }))
      : [{ id: createId("product"), name: "", points: "1", unit: "adet" }]
  );
  const [storeMultipliers, setStoreMultipliers] = useState<StoreMultiplierRow[]>(() =>
    initialValues?.storeMultipliers.length
      ? initialValues.storeMultipliers.map((item) => ({
          id: createId("store"),
          storeName: item.storeName,
          multiplier: String(item.multiplier)
        }))
      : [{ id: createId("store"), storeName: "", multiplier: "1" }]
  );
  const [participants, setParticipants] = useState<ParticipantRow[]>(() => {
    if (!initialValues?.participants.length) {
      return [createParticipantRow(1, 1), createParticipantRow(1, 2)];
    }

    const sideCounts = new Map<number, number>();
    return initialValues.participants.map((participant) => {
      const side = (sideCounts.get(participant.matchupNo) ?? 0) + 1;
      sideCounts.set(participant.matchupNo, side);
      return { ...participant, side: side === 1 ? 1 : 2 };
    });
  });
  const [feedback, setFeedback] = useState("");

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
      current.map((participant) => {
        if (participant.id !== id) {
          return participant;
        }

        if (field === "type") {
          return {
            ...participant,
            type: value as ParticipantRow["type"],
            profileId: "",
            label: "",
            memberIds: []
          };
        }

        return {
          ...participant,
          [field]: value
        };
      })
    );
  }

  function toggleMember(participantId: string, memberId: string) {
    setParticipants((current) =>
      current.map((participant) => {
        if (participant.id !== participantId) {
          return participant;
        }

        const exists = participant.memberIds.includes(memberId);
        return {
          ...participant,
          memberIds: exists
            ? participant.memberIds.filter((currentId) => currentId !== memberId)
            : [...participant.memberIds, memberId]
        };
      })
    );
  }

  function addProductRow() {
    setProducts((current) => [
      ...current,
      { id: createId("product"), name: "", points: "1", unit: "adet" }
    ]);
    setFeedback("Yeni duello urunu satiri eklendi.");
  }

  function addStoreMultiplierRow() {
    setStoreMultipliers((current) => [
      ...current,
      { id: createId("store"), storeName: "", multiplier: "1" }
    ]);
    setFeedback("Yeni duello magaza carpani satiri eklendi.");
  }

  function addMatchupRow() {
    setParticipants((current) => {
      const nextMatchupNo =
        current.reduce((maxValue, participant) => Math.max(maxValue, participant.matchupNo), 0) + 1;

      return [
        ...current,
        createParticipantRow(nextMatchupNo, 1),
        createParticipantRow(nextMatchupNo, 2)
      ];
    });
    setFeedback("Yeni duello eslesmesi eklendi.");
  }

  function removeMatchupRow(matchupNo: number) {
    const matchupCount = new Set(participants.map((participant) => participant.matchupNo)).size;

    if (matchupCount <= 1) {
      setFeedback("Duelloda en az bir eslesme kalmali.");
      return;
    }

    setParticipants((current) =>
      current.filter((participant) => participant.matchupNo !== matchupNo)
    );
    setFeedback(`Eslesme ${matchupNo} kaldirildi.`);
  }

  const productsPayload = useMemo(
    () =>
      JSON.stringify(
        products
          .filter((product) => product.name.trim())
          .map((product) => ({
            id: product.id,
            name: product.name.trim(),
            points: product.points.trim() || "1",
            unit: product.unit.trim() || "adet"
          }))
      ),
    [products]
  );

  const storeMultipliersPayload = useMemo(
    () =>
      storeMultipliers
        .map((item) => `${item.storeName.trim()}|${item.multiplier.trim() || "1"}`)
        .filter((line) => !line.startsWith("|"))
        .join("\n"),
    [storeMultipliers]
  );

  const participantsPayload = useMemo(
    () =>
      JSON.stringify(participants
        .slice()
        .sort((a, b) => a.matchupNo - b.matchupNo || a.side - b.side)
        .map((participant) => {
          if (participant.type === "profile") {
            const selectedProfile = profiles.find((profile) => profile.id === participant.profileId);

            if (!selectedProfile) {
              return "";
            }

            const visibleLabel = participant.label.trim() || selectedProfile.full_name;
            return {
              id: participant.id,
              kind: "PROFILE",
              matchupNo: participant.matchupNo,
              profileId: selectedProfile.id,
              label: visibleLabel,
              memberIds: [selectedProfile.id],
              winnerDescription: participant.winnerDescription.trim(),
              loserDescription: participant.loserDescription.trim()
            };
          }

          const groupName = participant.label.trim();
          if (!groupName || participant.memberIds.length === 0) {
            return "";
          }

          return {
            id: participant.id,
            kind: "GROUP",
            matchupNo: participant.matchupNo,
            profileId: null,
            label: groupName,
            memberIds: participant.memberIds,
            winnerDescription: participant.winnerDescription.trim(),
            loserDescription: participant.loserDescription.trim()
          };
        })
        .filter(Boolean)
      ),
    [participants, profiles]
  );

  const matchupRows = useMemo(() => {
    const matchupMap = new Map<number, ParticipantRow[]>();

    participants.forEach((participant) => {
      const currentRows = matchupMap.get(participant.matchupNo) ?? [];
      currentRows.push(participant);
      matchupMap.set(participant.matchupNo, currentRows);
    });

    return Array.from(matchupMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([matchupNo, rows]) => ({
        matchupNo,
        rows: rows.slice().sort((a, b) => a.side - b.side)
      }));
  }, [participants]);

  return (
    <>
      <div className="field-group">
        <div className="repeater-header">
          <div>
            <span>Duello Eslesmeleri</span>
            <small className="repeater-subtitle">
              Ayni duelloda birden fazla kisi-kisi veya grup-grup eslesmesi kurabilirsiniz.
            </small>
          </div>
          <button className="tiny-button approve" onClick={addMatchupRow} type="button">
            Eslesme Ekle
          </button>
        </div>

        <div className="repeater-list">
          {matchupRows.map(({ matchupNo, rows }) => (
            <div key={`matchup-${matchupNo}`} className="field-group">
              <div className="repeater-header">
                <div>
                  <span>Eslesme {matchupNo}</span>
                  <small className="repeater-subtitle">
                    Bu blokta iki taraf birbirine karsi yarisir.
                  </small>
                </div>
                {matchupRows.length > 1 ? (
                  <button
                    className="tiny-button"
                    onClick={() => removeMatchupRow(matchupNo)}
                    type="button"
                  >
                    Sil
                  </button>
                ) : null}
              </div>

              <div className="repeater-list">
                {rows.map((participant) => {
                  const sideLabel = participant.side === 1 ? "Taraf 1" : "Taraf 2";
                  const selectedProfile =
                    profiles.find((profile) => profile.id === participant.profileId) ?? null;

                  return (
                    <div key={participant.id} className="repeater-row">
                      <label className="field compact">
                        <span>{sideLabel} Tipi</span>
                        <select
                          onChange={(event) =>
                            updateParticipant(participant.id, "type", event.target.value)
                          }
                          value={participant.type}
                        >
                          <option value="profile">Kisi</option>
                          <option value="group">Grup</option>
                        </select>
                      </label>

                      {participant.type === "profile" ? (
                        <>
                          <label className="field compact">
                            <span>{sideLabel} Kisi</span>
                            <select
                              onChange={(event) =>
                                updateParticipant(participant.id, "profileId", event.target.value)
                              }
                              value={participant.profileId}
                            >
                              <option value="">Kisi secin</option>
                              {profiles.map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                  {profile.full_name}
                                  {profile.store_name ? ` | ${profile.store_name}` : ""}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="field compact">
                            <span>{sideLabel} Gorunen Adi</span>
                            <input
                              onChange={(event) =>
                                updateParticipant(participant.id, "label", event.target.value)
                              }
                              placeholder={
                                selectedProfile?.full_name ?? "Secilen kisi adi otomatik gelir"
                              }
                              value={participant.label}
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="field compact">
                            <span>{sideLabel} Grup Adi</span>
                            <input
                              onChange={(event) =>
                                updateParticipant(participant.id, "label", event.target.value)
                              }
                              placeholder="Ornek: 61 Sube Ekibi"
                              value={participant.label}
                            />
                          </label>

                          <div className="field compact">
                            <span>{sideLabel} Grup Uyeleri</span>
                            <div className="checkbox-grid permission-checkbox-grid">
                              {profiles.map((profile) => (
                                <label key={`${participant.id}-${profile.id}`} className="checkbox-card">
                                  <input
                                    checked={participant.memberIds.includes(profile.id)}
                                    onChange={() => toggleMember(participant.id, profile.id)}
                                    type="checkbox"
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

                      <label className="field compact">
                        <span>{sideLabel} Kazanirsa Ne Olur?</span>
                        <textarea
                          className="text-area"
                          onChange={(event) =>
                            updateParticipant(
                              participant.id,
                              "winnerDescription",
                              event.target.value
                            )
                          }
                          placeholder="Ornek: 1.000 TL prim kazanir"
                          rows={2}
                          value={participant.winnerDescription}
                        />
                      </label>

                      <label className="field compact">
                        <span>{sideLabel} Kaybederse Ne Olur?</span>
                        <textarea
                          className="text-area"
                          onChange={(event) =>
                            updateParticipant(
                              participant.id,
                              "loserDescription",
                              event.target.value
                            )
                          }
                          placeholder="Ornek: Ek gorevi tamamlar"
                          rows={2}
                          value={participant.loserDescription}
                        />
                      </label>

                      <div className="repeater-actions">
                        <span>{sideLabel}</span>
                      </div>
                    </div>
                  );
                })}
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
                  onChange={(event) => updateProduct(product.id, "name", event.target.value)}
                  placeholder="Ornek: Tablet"
                  value={product.name}
                />
              </label>

              <label className="field compact">
                <span>Puan</span>
                <input
                  min="1"
                  onChange={(event) => updateProduct(product.id, "points", event.target.value)}
                  type="number"
                  value={product.points}
                />
              </label>

              <label className="field compact">
                <span>Birim</span>
                <input
                  onChange={(event) => updateProduct(product.id, "unit", event.target.value)}
                  placeholder="adet"
                  value={product.unit}
                />
              </label>

              <div className="repeater-actions">
                <span>Urun #{index + 1}</span>
                <button
                  className="tiny-button"
                  disabled={products.length === 1}
                  onClick={() => {
                    setProducts((current) => current.filter((item) => item.id !== product.id));
                    setFeedback("Duello urun satiri silindi.");
                  }}
                  type="button"
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
            <small className="repeater-subtitle">
              {storeMultipliers.length} magaza carpani satiri hazir
            </small>
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
                  onChange={(event) =>
                    updateStoreMultiplier(item.id, "storeName", event.target.value)
                  }
                  value={item.storeName}
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
                  min="0"
                  onChange={(event) =>
                    updateStoreMultiplier(item.id, "multiplier", event.target.value)
                  }
                  step="0.01"
                  type="number"
                  value={item.multiplier}
                />
              </label>

              <div className="repeater-actions">
                <span>Magaza #{index + 1}</span>
                <button
                  className="tiny-button"
                  disabled={storeMultipliers.length === 1}
                  onClick={() => {
                    setStoreMultipliers((current) => current.filter((row) => row.id !== item.id));
                    setFeedback("Duello magaza carpani satiri silindi.");
                  }}
                  type="button"
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
