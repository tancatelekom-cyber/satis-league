import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SeasonRecord } from "@/lib/types";

type LeagueRow = {
  id: string;
  label: string;
  storeName?: string;
  score: number;
};

type SaleRow = {
  season_id: string;
  target_profile_id: string | null;
  target_store_id: string | null;
  score: number;
};

export default async function LeaguePage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: seasons } = await admin
    .from("seasons")
    .select(
      "id, name, description, start_date, end_date, mode, scoring, season_products, reward_title, reward_details, reward_first, reward_second, reward_third, is_active, created_at"
    )
    .order("start_date", { ascending: false });

  const seasonRows = (seasons as SeasonRecord[] | null) ?? [];
  const activeSeason = seasonRows.find((season) => season.is_active) ?? seasonRows[0] ?? null;

  if (!activeSeason) {
    return (
      <main>
        <h1 className="page-title">Sezonluk Lig Tablosu</h1>
        <p className="page-subtitle">
          Henuz aktif bir sezon tanimlanmadi. Once admin panelinden sezon olusturun.
        </p>
      </main>
    );
  }

  const seasonIds = seasonRows.map((season) => season.id);
  const [{ data: profiles }, { data: stores }, { data: seasonSales }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, approval, is_on_leave, store:stores(name)")
      .eq("approval", "approved"),
    admin.from("stores").select("id, name").eq("is_active", true),
    seasonIds.length > 0
      ? admin
          .from("season_sales_entries")
          .select("season_id, target_profile_id, target_store_id, score")
          .in("season_id", seasonIds)
      : Promise.resolve({ data: [] })
  ]);

  const profileRows =
    ((profiles as Array<{
      id: string;
      full_name: string;
      is_on_leave: boolean;
      store: { name: string } | null;
    }> | null) ?? []).filter((profile) => !profile.is_on_leave);
  const storeRows = ((stores as Array<{ id: string; name: string }> | null) ?? []);
  const saleRows = (seasonSales as SaleRow[] | null) ?? [];
  const today = new Date().toISOString().slice(0, 10);

  function buildEmployeeLeague(seasonId: string): LeagueRow[] {
    return profileRows
      .map((profile) => ({
        id: profile.id,
        label: profile.full_name,
        storeName: profile.store?.name ?? "Magaza yok",
        score: saleRows
          .filter((entry) => entry.season_id === seasonId && entry.target_profile_id === profile.id)
          .reduce((sum, entry) => sum + Number(entry.score ?? 0), 0)
      }))
      .sort((a, b) => b.score - a.score);
  }

  function buildStoreLeague(seasonId: string): LeagueRow[] {
    return storeRows
      .map((store) => ({
        id: store.id,
        label: store.name,
        score: saleRows
          .filter((entry) => entry.season_id === seasonId && entry.target_store_id === store.id)
          .reduce((sum, entry) => sum + Number(entry.score ?? 0), 0)
      }))
      .sort((a, b) => b.score - a.score);
  }

  const activeEmployeeLeague = buildEmployeeLeague(activeSeason.id).slice(0, 12);
  const activeStoreLeague = buildStoreLeague(activeSeason.id).slice(0, 12);
  const primaryLeague =
    activeSeason.mode === "employee" ? activeEmployeeLeague : activeStoreLeague;
  const secondaryLeague =
    activeSeason.mode === "employee" ? activeStoreLeague : activeEmployeeLeague;
  const podiumRows = [primaryLeague[1], primaryLeague[0], primaryLeague[2]].filter(Boolean) as LeagueRow[];
  const champion = primaryLeague[0] ?? null;
  const completedSeasons = seasonRows
    .filter((season) => season.id !== activeSeason.id && season.end_date <= today)
    .map((season) => {
      const seasonPrimaryLeague =
        season.mode === "employee" ? buildEmployeeLeague(season.id) : buildStoreLeague(season.id);
      return {
        ...season,
        champion: seasonPrimaryLeague[0] ?? null
      };
    })
    .filter((season) => season.champion)
    .slice(0, 6);

  return (
    <main>
      <h1 className="page-title">Sezonluk Lig Tablosu</h1>
      <p className="page-subtitle">
        Aktif sezon: {activeSeason.name} | {activeSeason.start_date} - {activeSeason.end_date}
      </p>

      <section className="momentum-grid">
        <article className="guide-card">
          <h3>Sezon Aciklamasi</h3>
          <p>{activeSeason.description ?? "Bu sezon icin aciklama girilmedi."}</p>
        </article>

        <article className="guide-card">
          <h3>Sezon Urunleri</h3>
          <div className="mission-pills">
            {activeSeason.season_products.length > 0 ? (
              activeSeason.season_products.map((product) => (
                <span key={product} className="mission-pill">
                  {product}
                </span>
              ))
            ) : (
              <span className="mission-pill">Sezon urunu tanimlanmadi</span>
            )}
          </div>
        </article>
      </section>

      <section className="campaign-layout">
        <article className="leaderboard-card">
          <h3>Sezon Sampiyonu</h3>
          {champion ? (
            <>
              <div className="podium-grid">
                {podiumRows.map((row, index) => {
                  const visualClass = index === 0 ? "silver" : index === 1 ? "gold" : "bronze";
                  const rank = index === 0 ? 2 : index === 1 ? 1 : 3;
                  return (
                    <div key={row.id} className={`podium-card ${visualClass}`}>
                      <span>{rank}</span>
                      <strong>{row.label}</strong>
                      <small>{row.storeName ?? "Magaza siralamasi"}</small>
                      <strong>{row.score.toFixed(0)}</strong>
                    </div>
                  );
                })}
              </div>

              <div className="profile-summary">
                <div className="summary-row">
                  <span>Lider</span>
                  <strong>{champion.label}</strong>
                </div>
                <div className="summary-row">
                  <span>Toplam Sezon Puani</span>
                  <strong>{champion.score.toFixed(0)}</strong>
                </div>
                <div className="summary-row">
                  <span>Yaris Turu</span>
                  <strong>{activeSeason.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"}</strong>
                </div>
              </div>
            </>
          ) : (
            <p>Bu sezon icin henuz puan birikmedi.</p>
          )}
        </article>

        <article className="leaderboard-card">
          <h3>Odul Vitrini</h3>
          <div className="step-list">
            <div className="step-item">
              <strong>{activeSeason.reward_title ?? "Odul tanimi bekleniyor"}</strong>
              <span>{activeSeason.reward_details ?? "Bu sezon icin odul aciklamasi girilmedi."}</span>
            </div>
            <div className="step-item">
              <strong>1. Sira</strong>
              <span>{activeSeason.reward_first ?? "Tanimlanmadi"}</span>
            </div>
            <div className="step-item">
              <strong>2. Sira</strong>
              <span>{activeSeason.reward_second ?? "Tanimlanmadi"}</span>
            </div>
            <div className="step-item">
              <strong>3. Sira</strong>
              <span>{activeSeason.reward_third ?? "Tanimlanmadi"}</span>
            </div>
          </div>
        </article>
      </section>

      <section className="campaign-layout">
        <article className="leaderboard-card">
          <h3>{activeSeason.mode === "employee" ? "Calisan Ligi" : "Magaza Ligi"}</h3>
          <div className="leaderboard-list">
            {primaryLeague.map((row, index) => (
              <div key={row.id} className="leaderboard-row">
                <div className="leaderboard-rank">{index + 1}</div>
                <div>
                  <h4>{row.label}</h4>
                  <p className="subtle">{row.storeName ?? "Sezon genel sirasi"}</p>
                </div>
                <div className="score">
                  <strong>{row.score.toFixed(0)}</strong>
                  <span className="subtle">sezon puani</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="leaderboard-card">
          <h3>{activeSeason.mode === "employee" ? "Magaza Ozeti" : "Calisan Ozeti"}</h3>
          <div className="leaderboard-list">
            {secondaryLeague.map((row, index) => (
              <div key={row.id} className="leaderboard-row">
                <div className="leaderboard-rank">{index + 1}</div>
                <div>
                  <h4>{row.label}</h4>
                  <p className="subtle">
                    {row.storeName ?? (activeSeason.mode === "employee" ? "Calisan sezon girdilerinden gelen toplam" : "Magaza sezonuna katki ozeti")}
                  </p>
                </div>
                <div className="score">
                  <strong>{row.score.toFixed(0)}</strong>
                  <span className="subtle">toplam puan</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="guide-card game-brief-card">
        <h3>Tamamlanan Sezonlar</h3>
        <div className="approval-list">
          {completedSeasons.length === 0 ? (
            <div className="step-item">
              <strong>Henuz tamamlanan sezon yok</strong>
              <span>Aktif sezon bittiginde burada kazananlar listelenecek.</span>
            </div>
          ) : (
            completedSeasons.map((season) => (
              <div key={season.id} className="approval-row">
                <div>
                  <h4>{season.name}</h4>
                  <p>
                    {season.start_date} - {season.end_date}
                  </p>
                  <p className="subtle">
                    Kazanan: {season.champion?.label ?? "-"} | Puan: {season.champion?.score.toFixed(0) ?? "0"}
                  </p>
                </div>
                <div className="score">
                  <strong>{season.reward_first ?? "Odul yok"}</strong>
                  <span className="subtle">birincilik odulu</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
