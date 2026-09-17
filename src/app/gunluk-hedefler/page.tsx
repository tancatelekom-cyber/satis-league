import Link from "next/link";
import { DailyTargetAutoSaveInput } from "@/components/daily-targets/daily-target-auto-save-input";
import {
  DailyTargetShareButton,
  DailyTargetSharePreview,
  type DailyTargetShareStore
} from "@/components/daily-targets/daily-target-share-button";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import { requireDailyTargetAccess } from "@/lib/auth/require-daily-target-access";
import {
  buildCompanyDailyTargetGroups,
  buildDailyTargetGroups,
  fetchDailyTargetDefinitions,
  formatIstanbulDay,
  getIstanbulDateKey,
  normalizeDailyTargetKey,
  summarizeDailyTargetGroups,
  type DailyTargetActualRecord,
  type DailyTargetGroup
} from "@/lib/daily-targets";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<{
    store?: string;
    message?: string;
    type?: "success" | "error";
  }>;
};

type StoreRow = {
  id: string;
  name: string;
  is_active: boolean;
};

type StoreView = {
  store: StoreRow;
  groups: DailyTargetGroup[];
  summary: ReturnType<typeof summarizeDailyTargetGroups>;
};

function formatNumber(value: number | null) {
  if (value === null) return "-";
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function buildStoreHref(storeId: string) {
  return `/gunluk-hedefler?store=${encodeURIComponent(storeId)}`;
}

export default async function DailyTargetsPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const { profile } = await requireDailyTargetAccess();
  const admin = createAdminClient();
  const today = getIstanbulDateKey();
  const dateLabel = formatIstanbulDay(today);
  let sheetError = "";
  let entryError = "";
  let definitions: Awaited<ReturnType<typeof fetchDailyTargetDefinitions>> = [];

  try {
    definitions = await fetchDailyTargetDefinitions();
  } catch (error) {
    sheetError = error instanceof Error ? error.message : "Günlük hedef Sheet'i okunamadı.";
  }

  const { data: storesData, error: storesError } = await admin
    .from("stores")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  const sheetBranchKeys = new Set(definitions.map((row) => normalizeDailyTargetKey(row.branchName)));
  const sheetStores = ((storesData as StoreRow[] | null) ?? []).filter((store) =>
    sheetBranchKeys.has(normalizeDailyTargetKey(store.name))
  );
  const visibleStores = profile.role === "manager"
    ? sheetStores.filter((store) => store.id === profile.store_id)
    : sheetStores;
  const requestedStoreId = String(params?.store ?? "").trim();
  const selectedStore = visibleStores.find((store) => store.id === requestedStoreId) ?? visibleStores[0] ?? null;
  let actualRecords: DailyTargetActualRecord[] = [];

  if (visibleStores.length) {
    const { data, error } = await admin
      .from("daily_target_entries")
      .select("store_id, main_category, sub_category, actual")
      .eq("entry_date", today)
      .in("store_id", visibleStores.map((store) => store.id));

    if (error) {
      entryError = error.code === "42P01" || error.message.toLowerCase().includes("daily_target_entries")
        ? "Günlük hedef kayıt tablosu henüz kurulmamış. Supabase SQL kodunu bir kez çalıştırın."
        : `Günlük gerçekleşenler okunamadı: ${error.message}`;
    } else {
      actualRecords = (data as DailyTargetActualRecord[] | null) ?? [];
    }
  }

  const storeViews: StoreView[] = visibleStores.map((store) => {
    const groups = buildDailyTargetGroups(
      definitions,
      store.name,
      actualRecords.filter((row) => row.store_id === store.id)
    );
    return { store, groups, summary: summarizeDailyTargetGroups(groups) };
  });
  const selectedStoreView = storeViews.find((item) => item.store.id === selectedStore?.id) ?? null;
  const companyGroups = buildCompanyDailyTargetGroups(storeViews.map((item) => item.groups));
  const companySummary = summarizeDailyTargetGroups(companyGroups);
  const canEdit = (profile.role === "manager" || profile.role === "admin") && !entryError && !sheetError;
  const canShare = profile.role === "manager" || profile.role === "admin";
  const shareStores: DailyTargetShareStore[] = profile.role === "manager"
    ? selectedStoreView
      ? [{ storeName: selectedStoreView.store.name, groups: selectedStoreView.groups }]
      : []
    : [
        ...storeViews.map((item) => ({ storeName: item.store.name, groups: item.groups })),
        { storeName: "Firma Toplamı", groups: companyGroups, isCompany: true }
      ];
  const targetOnlyShareStores: DailyTargetShareStore[] = profile.role === "admin"
    ? storeViews.map((item) => ({ storeName: item.store.name, groups: item.groups }))
    : [];

  return (
    <main className="daily-target-page">
      <section className="daily-target-hero">
        <div>
          <span className="daily-target-eyebrow">GÜNLÜK SATIŞ TAKİBİ</span>
          <h1>Günlük Hedefler</h1>
          <p>Sheet hedefleri, şube gerçekleşenleri ve kalan ihtiyaçlar tek bağımsız tabloda.</p>
        </div>
        <div className="daily-target-date-card">
          <span>Bugün</span>
          <strong>{dateLabel}</strong>
          <small>Yeni günde gerçekleşenler otomatik olarak sıfırdan başlar.</small>
        </div>
      </section>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}
      {storesError ? <div className="message-box error-box">Şubeler okunamadı: {storesError.message}</div> : null}
      {sheetError ? <div className="message-box error-box">{sheetError}</div> : null}
      {entryError ? <div className="message-box error-box">{entryError}</div> : null}

      <section className="daily-target-role-strip">
        <div>
          <span>Aktif kullanıcı</span>
          <strong>{profile.full_name}</strong>
        </div>
        <span className={`daily-target-role-badge daily-target-role-${profile.role}`}>
          {profile.role === "manager" ? "Mağaza müdürü · giriş ve görüntüleme" :
            profile.role === "admin" ? "Admin · tüm şubelerde giriş ve görüntüleme" :
              "Yönetici · yalnızca görüntüleme"}
        </span>
      </section>

      {profile.role !== "manager" && storeViews.length ? (
        <section className="daily-target-company-overview">
          <div className="daily-target-section-heading">
            <div>
              <span>FİRMA GÖRÜNÜMÜ</span>
              <h2>Tüm şubelerin günlük durumu</h2>
            </div>
            <div className="daily-target-company-score">
              <strong>%{companySummary.percent}</strong>
              <span>{companySummary.achievedCount}/{companySummary.targetedCount} hedefli satır tamamlandı</span>
            </div>
          </div>
          <div className="daily-target-store-cards">
            {storeViews.map((item) => (
              <Link
                className={`daily-target-store-card ${selectedStore?.id === item.store.id ? "daily-target-store-card-active" : ""}`}
                href={buildStoreHref(item.store.id)}
                key={item.store.id}
              >
                <span>{item.store.name}</span>
                <strong>%{item.summary.percent}</strong>
                <small>{item.summary.achievedCount}/{item.summary.targetedCount} tamamlandı</small>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {selectedStoreView ? (
        <section className="daily-target-workspace">
          <div className="daily-target-workspace-head">
            <div>
              <span>{canEdit ? "GERÇEKLEŞEN GİRİŞİ" : "GÖRÜNTÜLEME"}</span>
              <h2>{selectedStoreView.store.name}</h2>
              <p>
                “H” satırları alt kategorilerden otomatik toplanır. Hedefi olmayan satırlarda yalnızca gerçekleşen izlenir.
              </p>
            </div>
            {profile.role !== "manager" ? (
              <FilterSelectNav
                ariaLabel="Günlük hedef şubesi"
                value={buildStoreHref(selectedStoreView.store.id)}
                options={storeViews.map((item) => ({
                  label: item.store.name,
                  value: buildStoreHref(item.store.id)
                }))}
              />
            ) : null}
          </div>

          <div className="daily-target-entry-form">
            <div className="daily-target-category-list">
              {selectedStoreView.groups.map((group) => {
                const groupTargeted = group.rows.filter((row) => row.target !== null);
                const groupAchieved = groupTargeted.filter((row) => row.achieved).length;

                return (
                  <article className="daily-target-category" key={group.mainCategory}>
                    <header>
                      <div>
                        <span>ANA KATEGORİ</span>
                        <h3>{group.mainCategory}</h3>
                      </div>
                      <strong>{groupAchieved}/{groupTargeted.length} tamamlandı</strong>
                    </header>

                    <div className="daily-target-table-wrap">
                      <table className="daily-target-table">
                        <thead>
                          <tr>
                            <th>Alt kategori</th>
                            <th>Hedef</th>
                            <th>Gerçekleşen</th>
                            <th>Kalan</th>
                            <th>Durum</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => (
                            <tr
                              className={`${row.entryMode === "summary" ? "daily-target-summary-row" : ""} ${row.target === null ? "daily-target-actual-only-row" : ""}`}
                              key={`${selectedStoreView.store.id}-${group.mainCategory}-${row.subCategory}`}
                            >
                              <th>
                                <span>{row.subCategory}</span>
                                {row.entryMode === "summary" ? <small>Alt kategorilerin otomatik toplamı</small> : null}
                              </th>
                              <td data-label="Hedef">{row.target === null ? <span className="daily-target-no-target">Hedef yok</span> : formatNumber(row.target)}</td>
                              <td data-label="Gerçekleşen">
                                {canEdit && row.entryMode === "editable" && row.inputName ? (
                                  <DailyTargetAutoSaveInput
                                    actual={row.actual}
                                    ariaLabel={`${row.subCategory} gerçekleşen`}
                                    mainCategory={row.mainCategory}
                                    storeId={selectedStoreView.store.id}
                                    subCategory={row.subCategory}
                                  />
                                ) : (
                                  <strong>{formatNumber(row.actual)}</strong>
                                )}
                              </td>
                              <td data-label="Kalan">{row.remaining === null ? "-" : formatNumber(row.remaining)}</td>
                              <td data-label="Durum">
                                {row.achieved === null ? (
                                  <span className="daily-target-status daily-target-status-neutral">Kıyaslama yok</span>
                                ) : row.achieved ? (
                                  <span className="daily-target-status daily-target-status-success"><b aria-hidden="true">✓</b> Tamamlandı</span>
                                ) : (
                                  <span className="daily-target-status daily-target-status-danger"><b aria-hidden="true">✕</b> Eksik</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                );
              })}
            </div>

            {canEdit ? (
              <div className="daily-target-save-bar">
                <span>Değer değiştirildiğinde otomatik kaydedilir. Kayıtlar yalnızca {dateLabel} günü için geçerlidir.</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : !sheetError ? (
        <section className="daily-target-empty">
          <strong>Görüntülenecek şube bulunamadı.</strong>
          <p>Sheet şube adı ile kullanıcıya tanımlı mağaza adının aynı olduğunu kontrol edin.</p>
        </section>
      ) : null}

      {canShare && shareStores.length ? (
        <section className="daily-target-share-panel">
          <div>
            <span>GÖRSEL PAYLAŞIM</span>
            <h2>{profile.role === "admin" ? "Tüm şubeler ve firma toplamı" : `${selectedStore?.name ?? "Şube"} günlük tablosu`}</h2>
            <p>{profile.role === "admin"
              ? "Hedef-gerçekleşen özetini veya yalnızca şube hedeflerini PNG olarak paylaşabilirsiniz."
              : "Buton tabloyu PNG resmine dönüştürür ve WhatsApp paylaşım ekranını açar."}</p>
          </div>
          <div className="daily-target-share-actions">
            <DailyTargetShareButton
              dateLabel={dateLabel}
              mode={profile.role === "admin" ? "company" : "store"}
              stores={shareStores}
            />
            {profile.role === "admin" && targetOnlyShareStores.length ? (
              <DailyTargetShareButton
                dateLabel={dateLabel}
                mode="targets"
                stores={targetOnlyShareStores}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {shareStores.length ? (
        <DailyTargetSharePreview
          dateLabel={dateLabel}
          mode={profile.role === "manager" ? "store" : "company"}
          stores={shareStores}
        />
      ) : null}
    </main>
  );
}
