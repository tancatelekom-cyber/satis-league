import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createCampaignAction, createSeasonAction, createSeasonEmployeeSaleAction, createSeasonStoreSaleAction, createStoreAction, deleteCampaignAction, deleteSeasonAction, deleteSeasonSaleAction, endCampaignAction, toggleSeasonStatusAction, toggleStoreStatusAction, updateApprovalAction, updateCampaignAction, updateSeasonAction, updateSeasonSaleAction, updateStoreAction } from "@/app/admin/actions";
import { CampaignBuilder } from "@/components/admin/campaign-builder";
import { SeasonProductBuilder } from "@/components/admin/season-product-builder";
import { formatCampaignDateTime, isoToLocalDateTimeInput } from "@/lib/campaign-utils";
import { roleLabels } from "@/lib/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";
import { AdminCampaign, AdminPendingProfile, AdminSeason, AdminStore, CampaignProductRecord, CampaignStoreMultiplierRecord, SeasonProductRecord, SeasonStoreMultiplierRecord } from "@/lib/types";

const adminHighlights = [
  "Magaza listesi sadece admin tarafindan tanimlanir.",
  "Kayit ekranindaki magaza secimi bu listeden gelir.",
  "Pasif yapilan magaza yeni kayit ekranindan kaybolur.",
  "Bekleyen kullanicilar buradan onaylanir.",
  "Sonraki adimda kampanya formunu da canli hale getirecegiz."
];

type AdminPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
    saleSearch?: string;
    saleDateFrom?: string;
    saleDateTo?: string;
  }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const saleSearch = String(params?.saleSearch ?? "").trim().toLocaleLowerCase("tr-TR");
  const saleDateFrom = String(params?.saleDateFrom ?? "").trim();
  const saleDateTo = String(params?.saleDateTo ?? "").trim();

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return (
      <main>
        <h1 className="page-title">Admin Kontrol Merkezi</h1>
        <p className="page-subtitle">
          Admin islemlerini acabilmek icin once `.env.local` dosyasina Supabase
          bilgilerinin tam girilmis olmasi gerekiyor.
        </p>

        <section className="guide-card">
          <div className="step-list">
            <div className="step-item">
              <strong>1. Project URL</strong>
              <span>Supabase proje adresiniz `https://...supabase.co` seklinde olmali.</span>
            </div>
            <div className="step-item">
              <strong>2. Publishable key</strong>
              <span>`NEXT_PUBLIC_SUPABASE_ANON_KEY` alanina yazilmali.</span>
            </div>
            <div className="step-item">
              <strong>3. Secret key</strong>
              <span>`SUPABASE_SERVICE_ROLE_KEY` alanina yazilmali.</span>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const supabase = createAdminClient();
  const [{ data: stores }, { data: pendingProfiles }, { data: campaigns }, { data: seasons }] = await Promise.all([
    supabase.from("stores").select("id, name, city, base_multiplier, is_active").order("name"),
    supabase
      .from("profiles")
      .select(
        `
          id,
          full_name,
          email,
          phone,
          role,
          approval,
          created_at,
          store:stores(name)
        `
      )
      .eq("approval", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("campaigns")
      .select("id, name, description, mode, scoring, start_date, end_date, start_at, end_at, reward_title, reward_details, reward_first, reward_second, reward_third, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("seasons")
      .select("id, name, description, start_date, end_date, mode, scoring, season_products, reward_title, reward_details, reward_first, reward_second, reward_third, is_active, created_at")
      .order("start_date", { ascending: false })
  ]);

  const storeRows = (stores as AdminStore[] | null) ?? [];
  const approvalRows = (pendingProfiles as AdminPendingProfile[] | null) ?? [];
  const campaignRows = (campaigns as AdminCampaign[] | null) ?? [];
  const seasonRows = (seasons as AdminSeason[] | null) ?? [];
  const campaignIds = campaignRows.map((campaign) => campaign.id);
  const seasonIds = seasonRows.map((season) => season.id);
  const [{ data: campaignProducts }, { data: campaignStoreMultipliers }] = campaignIds.length
    ? await Promise.all([
        supabase
          .from("campaign_products")
          .select("id, campaign_id, name, unit_label, base_points, sort_order")
          .in("campaign_id", campaignIds)
          .order("sort_order"),
        supabase
          .from("campaign_store_multipliers")
          .select(
            `
              id,
              campaign_id,
              store_id,
              multiplier,
              store:stores(name)
            `
          )
          .in("campaign_id", campaignIds)
      ])
    : [{ data: [] as CampaignProductRecord[] }, { data: [] as CampaignStoreMultiplierRecord[] }];
  const productRows = (campaignProducts as CampaignProductRecord[] | null) ?? [];
  const multiplierRows =
    (campaignStoreMultipliers as CampaignStoreMultiplierRecord[] | null) ?? [];
  const [{ data: seasonProducts }, { data: seasonStoreMultipliers }] = seasonIds.length
    ? await Promise.all([
        supabase
          .from("season_products")
          .select("id, season_id, name, unit_label, base_points, sort_order")
          .in("season_id", seasonIds)
          .order("sort_order"),
        supabase
          .from("season_store_multipliers")
          .select(
            `
              id,
              season_id,
              store_id,
              multiplier,
              store:stores(name)
            `
          )
          .in("season_id", seasonIds)
      ])
    : [{ data: [] as SeasonProductRecord[] }, { data: [] as SeasonStoreMultiplierRecord[] }];
  const seasonProductRows = (seasonProducts as SeasonProductRecord[] | null) ?? [];
  const seasonMultiplierRows = (seasonStoreMultipliers as SeasonStoreMultiplierRecord[] | null) ?? [];
  const approvedProfilesForSeason =
    ((await supabase
      .from("profiles")
      .select("id, full_name, approval, store_id")
      .eq("approval", "approved")).data as Array<{ id: string; full_name: string; approval: string; store_id: string | null }> | null) ?? [];
  const activeSeason = seasonRows.find((season) => season.is_active) ?? null;
  const activeSeasonProducts = activeSeason
    ? seasonProductRows.filter((product) => product.season_id === activeSeason.id)
    : [];
  const activeSeasonSales =
    activeSeason
      ? (((await supabase
          .from("season_sales_entries")
          .select(
            `
              id,
              season_id,
              product_id,
              product_name,
              quantity,
              raw_score,
              score,
              note,
              created_at,
              target_profile_id,
              target_store_id,
              targetProfile:profiles!season_sales_entries_target_profile_id_fkey(full_name),
              targetStore:stores!season_sales_entries_target_store_id_fkey(name)
            `
          )
          .eq("season_id", activeSeason.id)
          .order("created_at", { ascending: false })
          .limit(100)).data as Array<{
          id: string;
          season_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          raw_score: number;
          score: number;
          note: string | null;
          created_at: string;
          target_profile_id: string | null;
          target_store_id: string | null;
          targetProfile: { full_name: string } | null;
          targetStore: { name: string } | null;
        }> | null) ?? [])
      : [];
  const filteredActiveSeasonSales = activeSeasonSales.filter((sale) => {
    const searchableText = [
      sale.product_name,
      sale.note ?? "",
      sale.targetProfile?.full_name ?? "",
      sale.targetStore?.name ?? ""
    ]
      .join(" ")
      .toLocaleLowerCase("tr-TR");
    const saleDay = sale.created_at.slice(0, 10);

    if (saleSearch && !searchableText.includes(saleSearch)) {
      return false;
    }

    if (saleDateFrom && saleDay < saleDateFrom) {
      return false;
    }

    if (saleDateTo && saleDay > saleDateTo) {
      return false;
    }

    return true;
  });
  const filteredSeasonSummary = filteredActiveSeasonSales.reduce(
    (acc, sale) => ({
      count: acc.count + 1,
      quantity: acc.quantity + Number(sale.quantity ?? 0),
      rawScore: acc.rawScore + Number(sale.raw_score ?? 0),
      score: acc.score + Number(sale.score ?? 0)
    }),
    { count: 0, quantity: 0, rawScore: 0, score: 0 }
  );

  return (
    <main>
      <h1 className="page-title">Admin Kontrol Merkezi</h1>
      <p className="page-subtitle">
        Bu alan artik sadece gorunen bir mock degil; magaza listesi ve bekleyen
        kullanici onayi buradan gercek veritabanina yazilir.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <section className="admin-stack">
        <article className="admin-card" id="sezon-yonetimi">
          <h3>Sezon Yonetimi</h3>
          <p>
            Lig tablosunun hangi tarih araligini ve hangi sezon urunlerini kullanacagini buradan siz belirlersiniz.
          </p>

          <form action={createSeasonAction} className="admin-form">
            <div className="auth-grid">
              <label className="field">
                <span>Sezon Adi</span>
                <input name="name" placeholder="Ornek: Yaz Sezonu 2026" required />
              </label>
              <label className="field">
                <span>Baslangic Tarihi</span>
                <input name="startDate" required type="date" />
              </label>
              <label className="field">
                <span>Bitis Tarihi</span>
                <input name="endDate" required type="date" />
              </label>
              <label className="field">
                <span>Sezon Tipi</span>
                <select defaultValue="employee" name="mode">
                  <option value="employee">Calisan Bazli</option>
                  <option value="store">Magaza Bazli</option>
                </select>
              </label>
              <label className="field">
                <span>Olcum Tipi</span>
                <select defaultValue="points" name="scoring">
                  <option value="points">Puan</option>
                  <option value="quantity">Adet</option>
                </select>
              </label>
              <label className="field season-toggle">
                <span>Aktif Sezon Yap</span>
                <input name="isActive" type="checkbox" />
              </label>
            </div>

            <label className="field">
              <span>Aciklama</span>
              <textarea
                className="text-area"
                name="description"
                placeholder="Bu sezonda odaklanilacak hedefleri yazin"
                rows={2}
              />
            </label>

            <div className="auth-grid">
              <label className="field">
                <span>Odul Basligi</span>
                <input name="rewardTitle" placeholder="Ornek: Sezon Sampiyonluk Odulleri" />
              </label>
              <label className="field">
                <span>Odul Detayi</span>
                <input name="rewardDetails" placeholder="Ornek: Prim, plaket ve kutlama duyurusu" />
              </label>
              <label className="field">
                <span>1. Sira Odulu</span>
                <input name="rewardFirst" placeholder="Ornek: 15.000 TL prim" />
              </label>
              <label className="field">
                <span>2. Sira Odulu</span>
                <input name="rewardSecond" placeholder="Ornek: 7.500 TL prim" />
              </label>
              <label className="field">
                <span>3. Sira Odulu</span>
                <input name="rewardThird" placeholder="Ornek: 3.000 TL prim" />
              </label>
            </div>

            <SeasonProductBuilder
              productFieldName="seasonProducts"
              multiplierFieldName="seasonStoreMultipliers"
              stores={storeRows.filter((store) => store.is_active)}
            />

            <div className="auth-actions">
              <button className="button-primary" type="submit">
                Sezonu Kaydet
              </button>
            </div>
          </form>

          <div className="approval-list">
            {seasonRows.length === 0 ? (
              <div className="step-item">
                <strong>Henuz sezon yok</strong>
                <span>Ilk sezonu yukaridan olusturun.</span>
              </div>
            ) : (
              seasonRows.map((season) => (
                <div key={season.id} className="approval-row">
                  <div>
                    <h4>{season.name}</h4>
                    <p>
                      {season.start_date} - {season.end_date}
                    </p>
                    <p className="subtle">{season.description ?? "Aciklama yok"}</p>
                    <p className="subtle">
                      Tur: {season.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"} |{" "}
                      {season.scoring === "points" ? "Puan" : "Adet"}
                    </p>
                    <p className="subtle">
                      Sezon urunleri: {seasonProductRows.filter((item) => item.season_id === season.id).map((item) => `${item.name} (${item.base_points} ${item.unit_label})`).join(", ") || "Tanimlanmadi"}
                    </p>
                    <p className="subtle">
                      Magaza carpanlari: {seasonMultiplierRows.filter((item) => item.season_id === season.id).map((item) => `${item.store?.name ?? "Magaza"} x${item.multiplier}`).join(", ") || "Varsayilan 1.00"}
                    </p>
                    <p className="subtle">
                      Oduller:{" "}
                      {season.reward_title
                        ? `${season.reward_title} | 1: ${season.reward_first ?? "-"} | 2: ${season.reward_second ?? "-"} | 3: ${season.reward_third ?? "-"}`
                        : "Odul tanimlanmadi"}
                    </p>
                  </div>

                  <div className="campaign-manage-card">
                    <form action={updateSeasonAction} className="admin-form">
                      <input name="seasonId" type="hidden" value={season.id} />

                      <div className="auth-grid">
                        <label className="field compact">
                          <span>Sezon Adi</span>
                          <input defaultValue={season.name} name="name" required />
                        </label>
                        <label className="field compact">
                          <span>Baslangic</span>
                          <input defaultValue={season.start_date} name="startDate" required type="date" />
                        </label>
                        <label className="field compact">
                          <span>Bitis</span>
                          <input defaultValue={season.end_date} name="endDate" required type="date" />
                        </label>
                        <label className="field compact">
                          <span>Sezon Tipi</span>
                          <select defaultValue={season.mode} name="mode">
                            <option value="employee">Calisan Bazli</option>
                            <option value="store">Magaza Bazli</option>
                          </select>
                        </label>
                        <label className="field compact">
                          <span>Olcum Tipi</span>
                          <select defaultValue={season.scoring} name="scoring">
                            <option value="points">Puan</option>
                            <option value="quantity">Adet</option>
                          </select>
                        </label>
                        <label className="field compact season-toggle">
                          <span>Aktif Sezon</span>
                          <input defaultChecked={season.is_active} name="isActive" type="checkbox" />
                        </label>
                      </div>

                      <label className="field compact">
                        <span>Aciklama</span>
                        <textarea
                          className="text-area"
                          defaultValue={season.description ?? ""}
                          name="description"
                          rows={2}
                        />
                      </label>

                      <div className="auth-grid">
                        <label className="field compact">
                          <span>Odul Basligi</span>
                          <input defaultValue={season.reward_title ?? ""} name="rewardTitle" />
                        </label>
                        <label className="field compact">
                          <span>Odul Detayi</span>
                          <input defaultValue={season.reward_details ?? ""} name="rewardDetails" />
                        </label>
                        <label className="field compact">
                          <span>1. Sira Odulu</span>
                          <input defaultValue={season.reward_first ?? ""} name="rewardFirst" />
                        </label>
                        <label className="field compact">
                          <span>2. Sira Odulu</span>
                          <input defaultValue={season.reward_second ?? ""} name="rewardSecond" />
                        </label>
                        <label className="field compact">
                          <span>3. Sira Odulu</span>
                          <input defaultValue={season.reward_third ?? ""} name="rewardThird" />
                        </label>
                      </div>

                      <SeasonProductBuilder
                        productFieldName="seasonProducts"
                        multiplierFieldName="seasonStoreMultipliers"
                        stores={storeRows.filter((store) => store.is_active)}
                        initialProducts={seasonProductRows
                          .filter((item) => item.season_id === season.id)
                          .map((item) => ({
                            name: item.name,
                            base_points: item.base_points,
                            unit_label: item.unit_label
                          }))}
                        initialMultipliers={seasonMultiplierRows
                          .filter((item) => item.season_id === season.id)
                          .map((item) => ({
                            storeName: item.store?.name ?? "",
                            multiplier: item.multiplier
                          }))}
                      />

                      <div className="campaign-manage-actions">
                        <button className="tiny-button approve" type="submit">
                          Guncelle
                        </button>
                      </div>
                    </form>

                    <div className="campaign-manage-actions">
                      <div className="store-status">
                        <span>Durum</span>
                        <strong>{season.is_active ? "Aktif Sezon" : "Pasif"}</strong>
                      </div>

                      <form action={toggleSeasonStatusAction}>
                        <input name="seasonId" type="hidden" value={season.id} />
                        <input name="isActive" type="hidden" value={String(season.is_active)} />
                        <button className="tiny-button" type="submit">
                          {season.is_active ? "Pasif Yap" : "Aktif Yap"}
                        </button>
                      </form>

                      <form action={deleteSeasonAction}>
                        <input name="seasonId" type="hidden" value={season.id} />
                        <button className="tiny-button danger" type="submit">
                          Sil
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="admin-card">
          <h3>Sezon Satis Girisi</h3>
          <p>
            Sezon urunlerini ve sezon puanlarini sadece admin girer. Lig tablosu bu alandaki kayitlardan beslenir.
          </p>

          {activeSeason ? (
            <div className="message-box success-box">
              Aktif sezon hazir: <strong>{activeSeason.name}</strong>. Satislari bu alanin altindan girebilirsiniz.
            </div>
          ) : (
            <div className="message-box error-box">
              Henuz aktif sezon secilmedigi icin satis giris alani acilmiyor. Once yukaridaki{" "}
              <a href="#sezon-yonetimi">Sezon Yonetimi</a> bolumunden bir sezonu <strong>Aktif Yap</strong>.
            </div>
          )}

          {activeSeason ? (
            <div className="season-entry-shell">
              <div className="season-entry-summary">
                <div className="season-entry-chip">
                  <span>Aktif Sezon</span>
                  <strong>{activeSeason.name}</strong>
                </div>
                <div className="season-entry-chip">
                  <span>Yaris Tipi</span>
                  <strong>{activeSeason.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"}</strong>
                </div>
                <div className="season-entry-chip">
                  <span>Olcum</span>
                  <strong>{activeSeason.scoring === "points" ? "Puan" : "Adet"}</strong>
                </div>
                <div className="season-entry-chip">
                  <span>Urun Sayisi</span>
                  <strong>{activeSeasonProducts.length}</strong>
                </div>
              </div>

              <div className="campaign-layout">
              <article className="campaign-card">
                <h4>
                  {activeSeason.mode === "employee"
                    ? "Calisan Icin Sezon Girisi"
                    : "Magaza Icin Sezon Girisi"}
                </h4>
                <p className="season-entry-tip">
                  Sirayla hedefi secin, urunu secin, miktari girin ve kaydedin.
                </p>
                <form
                  action={
                    activeSeason.mode === "employee"
                      ? createSeasonEmployeeSaleAction
                      : createSeasonStoreSaleAction
                  }
                  className="admin-form"
                >
                  <input name="seasonId" type="hidden" value={activeSeason.id} />
                  <div className="auth-grid">
                    <label className="field">
                      <span>Aktif Sezon</span>
                      <input disabled value={activeSeason.name} />
                    </label>
                    <label className="field">
                      <span>Sezon Urunu</span>
                      <select name="productId" required>
                        <option value="">Urun secin</option>
                        {activeSeasonProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} ({product.base_points} {product.unit_label})
                          </option>
                        ))}
                      </select>
                    </label>
                    {activeSeason.mode === "employee" ? (
                      <label className="field">
                        <span>Hedef Calisan</span>
                        <select name="targetProfileId" required>
                          <option value="">Calisan secin</option>
                          {approvedProfilesForSeason.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {profile.full_name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="field">
                        <span>Hedef Magaza</span>
                        <select name="targetStoreId" required>
                          <option value="">Magaza secin</option>
                          {storeRows.filter((store) => store.is_active).map((store) => (
                            <option key={store.id} value={store.id}>
                              {store.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="field">
                      <span>Miktar</span>
                      <input defaultValue="1" min="1" name="quantity" type="number" />
                    </label>
                    <label className="field">
                      <span>Olcum Sekli</span>
                      <input disabled value={activeSeason.scoring === "points" ? "Puan" : "Adet"} />
                    </label>
                  </div>
                  <label className="field">
                    <span>Not</span>
                    <input name="note" placeholder="Ornek: Vitrin paketi satisi" />
                  </label>
                  <div className="auth-actions">
                    <button className="button-primary" type="submit">
                      {activeSeason.mode === "employee" ? "Calisan Sezon Girisi Kaydet" : "Magaza Sezon Girisi Kaydet"}
                    </button>
                  </div>
                </form>
              </article>

              <article className="campaign-card">
                <h4>Sezon Kurallari</h4>
                <div className="step-list">
                  <div className="step-item">
                    <strong>Sezon Tipi</strong>
                    <span>{activeSeason.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"}</span>
                  </div>
                  <div className="step-item">
                    <strong>Olcum Tipi</strong>
                    <span>{activeSeason.scoring === "points" ? "Puan" : "Adet"}</span>
                  </div>
                  <div className="step-item">
                    <strong>Magaza Carpanlari</strong>
                    <span>
                      {seasonMultiplierRows
                        .filter((item) => item.season_id === activeSeason.id)
                        .map((item) => `${item.store?.name ?? "Magaza"} x${item.multiplier}`)
                        .join(", ") || "Varsayilan 1.00"}
                    </span>
                  </div>
                  <div className="step-item">
                    <strong>Urun Havuzu</strong>
                    <span>
                      {activeSeasonProducts
                        .map((product) => `${product.name} (${product.base_points} ${product.unit_label})`)
                        .join(", ") || "Urun yok"}
                    </span>
                  </div>
                </div>
              </article>
            </div>
            </div>
          ) : (
            <div className="step-item">
              <strong>Aktif sezon bulunamadi</strong>
              <span>Once bir sezonu aktif yapin, sonra sezon satis girisi acilir.</span>
            </div>
          )}

          {activeSeason ? (
            <div className="approval-list">
              <form className="admin-form" method="get">
                <div className="auth-grid">
                  <label className="field compact">
                    <span>Arama</span>
                    <input
                      defaultValue={params?.saleSearch ?? ""}
                      name="saleSearch"
                      placeholder="Urun, calisan, magaza veya not"
                    />
                  </label>
                  <label className="field compact">
                    <span>Tarih Baslangic</span>
                    <input defaultValue={saleDateFrom} name="saleDateFrom" type="date" />
                  </label>
                  <label className="field compact">
                    <span>Tarih Bitis</span>
                    <input defaultValue={saleDateTo} name="saleDateTo" type="date" />
                  </label>
                </div>
                <div className="auth-actions">
                  <button className="tiny-button approve" type="submit">
                    Listeyi Filtrele
                  </button>
                  <a className="tiny-button" href="/admin">
                    Filtreyi Temizle
                  </a>
                </div>
              </form>

              <div className="profile-summary">
                <div className="summary-row">
                  <span>Gorunen Kayit</span>
                  <strong>{filteredSeasonSummary.count}</strong>
                </div>
                <div className="summary-row">
                  <span>Toplam Miktar</span>
                  <strong>{filteredSeasonSummary.quantity.toFixed(0)}</strong>
                </div>
                <div className="summary-row">
                  <span>Toplam Ham Deger</span>
                  <strong>{filteredSeasonSummary.rawScore.toFixed(0)}</strong>
                </div>
                <div className="summary-row">
                  <span>Toplam Sezon Puani</span>
                  <strong>{filteredSeasonSummary.score.toFixed(0)}</strong>
                </div>
              </div>

              {activeSeasonSales.length === 0 ? (
                <div className="step-item">
                  <strong>Henuz sezon satisi yok</strong>
                  <span>Ilk satis girisini yukaridaki formdan yapin.</span>
                </div>
              ) : filteredActiveSeasonSales.length === 0 ? (
                <div className="step-item">
                  <strong>Filtreye uyan kayit bulunamadi</strong>
                  <span>Arama metnini veya tarih araligini degistirin.</span>
                </div>
              ) : (
                filteredActiveSeasonSales.map((sale) => (
                  <div key={sale.id} className="approval-row">
                    <div>
                      <h4>{sale.product_name}</h4>
                      <p>
                        {activeSeason.mode === "employee"
                          ? sale.targetProfile?.full_name ?? "Calisan yok"
                          : sale.targetStore?.name ?? "Magaza yok"}
                      </p>
                      <p className="subtle">
                        Miktar: {sale.quantity} | Ham Deger: {Number(sale.raw_score ?? 0).toFixed(0)} |
                        Toplam: {Number(sale.score ?? 0).toFixed(0)}
                      </p>
                      <p className="subtle">{sale.note ?? "Not yok"}</p>
                    </div>

                    <div className="campaign-manage-card">
                      <form action={updateSeasonSaleAction} className="admin-form">
                        <input name="saleId" type="hidden" value={sale.id} />
                        <input name="seasonId" type="hidden" value={activeSeason.id} />

                        <div className="auth-grid">
                          <label className="field compact">
                            <span>Urun</span>
                            <select defaultValue={sale.product_id ?? ""} name="productId" required>
                              <option value="">Urun secin</option>
                              {activeSeasonProducts.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} ({product.base_points} {product.unit_label})
                                </option>
                              ))}
                            </select>
                          </label>

                          {activeSeason.mode === "employee" ? (
                            <label className="field compact">
                              <span>Calisan</span>
                              <select defaultValue={sale.target_profile_id ?? ""} name="targetProfileId" required>
                                <option value="">Calisan secin</option>
                                {approvedProfilesForSeason.map((profile) => (
                                  <option key={profile.id} value={profile.id}>
                                    {profile.full_name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <label className="field compact">
                              <span>Magaza</span>
                              <select defaultValue={sale.target_store_id ?? ""} name="targetStoreId" required>
                                <option value="">Magaza secin</option>
                                {storeRows.filter((store) => store.is_active).map((store) => (
                                  <option key={store.id} value={store.id}>
                                    {store.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}

                          <label className="field compact">
                            <span>Miktar</span>
                            <input defaultValue={sale.quantity} min="1" name="quantity" type="number" />
                          </label>
                        </div>

                        <label className="field compact">
                          <span>Not</span>
                          <input defaultValue={sale.note ?? ""} name="note" />
                        </label>

                        <div className="campaign-manage-actions">
                          <button className="tiny-button approve" type="submit">
                            Guncelle
                          </button>
                        </div>
                      </form>

                      <div className="campaign-manage-actions">
                        <div className="store-status">
                          <span>Kayit Zamani</span>
                          <strong>{new Date(sale.created_at).toLocaleString("tr-TR")}</strong>
                        </div>

                        <form action={deleteSeasonSaleAction}>
                          <input name="saleId" type="hidden" value={sale.id} />
                          <button className="tiny-button danger" type="submit">
                            Sil
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </article>

        <article className="admin-card">
          <h3>Canli Kampanya Olustur</h3>
          <p>
            Buradan actiginiz kampanyalar dogrudan kullanici tarafindaki kampanya ekraninda gorunur.
          </p>

          <form action={createCampaignAction} className="admin-form">
            <div className="auth-grid">
              <label className="field">
                <span>Kampanya Adi</span>
                <input name="name" placeholder="Ornek: Mayis Hedef Yarisi" required />
              </label>
              <label className="field">
                <span>Kampanya Tipi</span>
                <select defaultValue="employee" name="mode">
                  <option value="employee">Calisan Bazli</option>
                  <option value="store">Magaza Bazli</option>
                </select>
              </label>
              <label className="field">
                <span>Olcum Tipi</span>
                <select defaultValue="points" name="scoring">
                  <option value="points">Puan</option>
                  <option value="quantity">Adet</option>
                </select>
              </label>
              <label className="field">
                <span>Baslangic Tarih ve Saat</span>
                <input name="startAt" required type="datetime-local" />
              </label>
              <label className="field">
                <span>Bitis Tarih ve Saat</span>
                <input name="endAt" required type="datetime-local" />
              </label>
            </div>

            <label className="field">
              <span>Aciklama</span>
              <textarea
                className="text-area"
                name="description"
                placeholder="Kampanyanin amaci, odulu ve hedef kitlesi"
                rows={3}
              />
            </label>

            <div className="auth-grid">
              <label className="field">
                <span>Odul Basligi</span>
                <input name="rewardTitle" placeholder="Ornek: Aylik Sampiyon Odulleri" />
              </label>
              <label className="field">
                <span>Odul Detayi</span>
                <input name="rewardDetails" placeholder="Ornek: Prim, hediye ceki ve kutlama duyurusu" />
              </label>
              <label className="field">
                <span>1. Sira Odulu</span>
                <input name="rewardFirst" placeholder="Ornek: 10.000 TL prim" />
              </label>
              <label className="field">
                <span>2. Sira Odulu</span>
                <input name="rewardSecond" placeholder="Ornek: 5.000 TL prim" />
              </label>
              <label className="field">
                <span>3. Sira Odulu</span>
                <input name="rewardThird" placeholder="Ornek: 2.500 TL prim" />
              </label>
            </div>

            <CampaignBuilder stores={storeRows.filter((store) => store.is_active)} />

            <div className="auth-actions">
              <button className="button-primary" type="submit">
                Kampanyayi Ac
              </button>
            </div>
          </form>
        </article>

        <article className="admin-card">
          <h3>Magaza Ekle</h3>
          <p>
            Yeni kayit ekraninda gorsun istediginiz her magaza once buradan tanimlanir.
          </p>

          <form action={createStoreAction} className="admin-form">
            <div className="auth-grid">
              <label className="field">
                <span>Magaza Adi</span>
                <input name="name" placeholder="Ornek: Cevahir AVM" required />
              </label>
              <label className="field">
                <span>Sehir</span>
                <input name="city" placeholder="Ornek: Istanbul" />
              </label>
              <label className="field">
                <span>Temel Puan Carpani</span>
                <input defaultValue="1" name="baseMultiplier" step="0.01" type="number" />
              </label>
            </div>

            <div className="auth-actions">
              <button className="button-primary" type="submit">
                Magazayi Kaydet
              </button>
            </div>
          </form>
        </article>

        <article className="admin-card">
          <h3>Son Kampanyalar</h3>
          <p>Buradaki kampanyalari guncelleyebilir, sonlandirabilir veya silebilirsiniz.</p>

          <div className="approval-list">
            {campaignRows.length === 0 ? (
              <div className="step-item">
                <strong>Henuz kampanya yok</strong>
                <span>Ilk kampanyayi yukaridaki formdan olusturun.</span>
              </div>
            ) : (
              campaignRows.map((campaign) => (
                <div key={campaign.id} className="approval-row">
                  <div>
                    <h4>{campaign.name}</h4>
                    <p>
                      {campaign.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"} |{" "}
                      {campaign.scoring === "points" ? "Puan" : "Adet"}
                    </p>
                    <p className="subtle">
                      {formatCampaignDateTime(campaign.start_at)} - {formatCampaignDateTime(campaign.end_at)}
                    </p>
                    <p className="subtle">
                      Urunler:{" "}
                      {productRows
                        .filter((product) => product.campaign_id === campaign.id)
                        .map((product) => `${product.name} (${product.base_points} ${product.unit_label})`)
                        .join(", ") || "Urun yok"}
                    </p>
                    <p className="subtle">
                      Magaza carpanlari:{" "}
                      {multiplierRows
                        .filter((item) => item.campaign_id === campaign.id)
                        .map((item) => `${item.store?.name ?? "Magaza"} x${item.multiplier}`)
                        .join(", ") || "Varsayilan 1.00"}
                    </p>
                    <p className="subtle">
                      Oduller:{" "}
                      {campaign.reward_title
                        ? `${campaign.reward_title} | 1: ${campaign.reward_first ?? "-"} | 2: ${campaign.reward_second ?? "-"} | 3: ${campaign.reward_third ?? "-"}`
                        : "Odul tanimlanmadi"}
                    </p>
                  </div>

                  <div className="campaign-manage-card">
                    <form action={updateCampaignAction} className="admin-form">
                      <input name="campaignId" type="hidden" value={campaign.id} />

                      <div className="auth-grid">
                        <label className="field compact">
                          <span>Kampanya Adi</span>
                          <input defaultValue={campaign.name} name="name" required />
                        </label>
                        <label className="field compact">
                          <span>Kampanya Tipi</span>
                          <select defaultValue={campaign.mode} name="mode">
                            <option value="employee">Calisan Bazli</option>
                            <option value="store">Magaza Bazli</option>
                          </select>
                        </label>
                        <label className="field compact">
                          <span>Olcum Tipi</span>
                          <select defaultValue={campaign.scoring} name="scoring">
                            <option value="points">Puan</option>
                            <option value="quantity">Adet</option>
                          </select>
                        </label>
                        <label className="field compact">
                          <span>Baslangic</span>
                          <input
                            defaultValue={isoToLocalDateTimeInput(campaign.start_at)}
                            name="startAt"
                            required
                            type="datetime-local"
                          />
                        </label>
                        <label className="field compact">
                          <span>Bitis</span>
                          <input
                            defaultValue={isoToLocalDateTimeInput(campaign.end_at)}
                            name="endAt"
                            required
                            type="datetime-local"
                          />
                        </label>
                      </div>

                      <label className="field compact">
                        <span>Aciklama</span>
                        <textarea
                          className="text-area"
                          defaultValue={campaign.description ?? ""}
                          name="description"
                          rows={2}
                        />
                      </label>

                      <div className="auth-grid">
                        <label className="field compact">
                          <span>Odul Basligi</span>
                          <input defaultValue={campaign.reward_title ?? ""} name="rewardTitle" />
                        </label>
                        <label className="field compact">
                          <span>Odul Detayi</span>
                          <input defaultValue={campaign.reward_details ?? ""} name="rewardDetails" />
                        </label>
                        <label className="field compact">
                          <span>1. Sira Odulu</span>
                          <input defaultValue={campaign.reward_first ?? ""} name="rewardFirst" />
                        </label>
                        <label className="field compact">
                          <span>2. Sira Odulu</span>
                          <input defaultValue={campaign.reward_second ?? ""} name="rewardSecond" />
                        </label>
                        <label className="field compact">
                          <span>3. Sira Odulu</span>
                          <input defaultValue={campaign.reward_third ?? ""} name="rewardThird" />
                        </label>
                      </div>

                      <label className="field compact">
                        <span>Kampanya Magaza Carpanlari</span>
                        <textarea
                          className="text-area"
                          defaultValue={multiplierRows
                            .filter((item) => item.campaign_id === campaign.id)
                            .map((item) => `${item.store?.name ?? ""}|${item.multiplier}`)
                            .join("\n")}
                          name="storeMultipliers"
                          rows={4}
                        />
                      </label>

                      <div className="campaign-manage-actions">
                        <button className="tiny-button approve" type="submit">
                          Guncelle
                        </button>
                      </div>
                    </form>

                    <div className="campaign-manage-actions">
                      <div className="store-status">
                        <span>Durum</span>
                        <strong>{campaign.is_active ? "Aktif" : "Pasif"}</strong>
                      </div>

                      <form action={endCampaignAction}>
                        <input name="campaignId" type="hidden" value={campaign.id} />
                        <button className="tiny-button" type="submit">
                          Sonlandir
                        </button>
                      </form>

                      <form action={deleteCampaignAction}>
                        <input name="campaignId" type="hidden" value={campaign.id} />
                        <button className="tiny-button danger" type="submit">
                          Sil
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="admin-card">
          <h3>Magaza Listesi</h3>
          <p>
            Buradaki aktif magazalar kayit ekraninda secilebilir. Pasif yaptiklariniz
            secim listesinden kaybolur.
          </p>

          <div className="store-admin-list">
            {storeRows.map((store) => (
              <div key={store.id} className="store-admin-row">
                <form action={updateStoreAction} className="store-edit-form">
                  <input name="id" type="hidden" value={store.id} />

                  <label className="field compact">
                    <span>Magaza</span>
                    <input defaultValue={store.name} name="name" required />
                  </label>

                  <label className="field compact">
                    <span>Sehir</span>
                    <input defaultValue={store.city ?? ""} name="city" />
                  </label>

                  <label className="field compact">
                    <span>Carpan</span>
                    <input
                      defaultValue={String(store.base_multiplier)}
                      name="baseMultiplier"
                      step="0.01"
                      type="number"
                    />
                  </label>

                  <div className="store-status">
                    <span>Durum</span>
                    <strong>{store.is_active ? "Aktif" : "Pasif"}</strong>
                  </div>

                  <div className="action-row">
                    <button className="tiny-button approve" type="submit">
                      Guncelle
                    </button>
                  </div>
                </form>

                <form action={toggleStoreStatusAction}>
                  <input name="id" type="hidden" value={store.id} />
                  <input name="isActive" type="hidden" value={String(store.is_active)} />
                  <button className="tiny-button" type="submit">
                    {store.is_active ? "Pasif Yap" : "Tekrar Aktif Et"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-card">
          <h3>Bekleyen Kayit Onaylari</h3>
          <p>
            Kullanici kayit olduktan sonra burada bekler. Onay verirseniz `/hesabim`
            ekraninda durumu aktif gorur.
          </p>

          <div className="approval-list">
            {approvalRows.length === 0 ? (
              <div className="step-item">
                <strong>Bekleyen kayit yok</strong>
                <span>Yeni kullanici kayit olunca burada gorunecek.</span>
              </div>
            ) : (
              approvalRows.map((approval) => (
                <div key={approval.id} className="approval-row">
                  <div>
                    <h4>{approval.full_name}</h4>
                    <p>
                      {approval.store?.name ?? "Magaza yok"} | {approval.phone ?? "-"}
                    </p>
                    <p className="subtle">
                      Rol: {roleLabels[approval.role]} | Mail: {approval.email}
                    </p>
                  </div>

                  <div className="action-row">
                    <form action={updateApprovalAction}>
                      <input name="profileId" type="hidden" value={approval.id} />
                      <input name="approval" type="hidden" value="approved" />
                      <button className="tiny-button approve" type="submit">
                        Onayla
                      </button>
                    </form>

                    <form action={updateApprovalAction}>
                      <input name="profileId" type="hidden" value={approval.id} />
                      <input name="approval" type="hidden" value="rejected" />
                      <button className="tiny-button" type="submit">
                        Reddet
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="guide-card">
          <h3>Bu panel artik ne yapiyor?</h3>
          <div className="step-list">
            {adminHighlights.map((item, index) => (
              <div key={item} className="step-item">
                <strong>Kontrol {index + 1}</strong>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
