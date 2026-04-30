import { redirect } from "next/navigation";
import {
  daysLeftLabel,
  formatCampaignDateTime,
  isSalesWindowOpen
} from "@/lib/campaign-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CampaignPageCampaign, CampaignProductRecord, ProfileSummary } from "@/lib/types";

type StoreScoreRow = {
  id: string;
  label: string;
  score: number;
};

export default async function StoreVersusPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: profileData } = await admin
    .from("profiles")
    .select(
      `
        id,
        full_name,
        email,
        phone,
        role,
        approval,
        is_on_leave,
        store:stores(name)
      `
    )
    .eq("id", user.id)
    .single();

  const profile = (profileData as ProfileSummary | null) ?? null;

  if (!profile || profile.approval !== "approved") {
    redirect("/hesabim");
  }

  const [{ data: campaigns }, { data: stores }, { data: salesEntries }] = await Promise.all([
    admin
      .from("campaigns")
      .select("id, name, description, mode, scoring, start_date, end_date, start_at, end_at, reward_title, reward_details, reward_first, reward_second, reward_third, is_active")
      .eq("is_active", true)
      .eq("mode", "store")
      .order("created_at", { ascending: false }),
    admin.from("stores").select("id, name").eq("is_active", true),
    admin.from("sales_entries").select("campaign_id, target_store_id, weighted_score")
  ]);

  const activeStoreCampaigns = ((campaigns as CampaignPageCampaign[] | null) ?? []).filter((campaign) =>
    isSalesWindowOpen(campaign.start_at, campaign.end_at)
  );

  const campaignIds = activeStoreCampaigns.map((campaign) => campaign.id);
  const { data: products } = campaignIds.length
    ? await admin
        .from("campaign_products")
        .select("id, campaign_id, name, unit_label, base_points, sort_order")
        .in("campaign_id", campaignIds)
        .order("sort_order")
    : { data: [] as CampaignProductRecord[] };

  const productRows = (products as CampaignProductRecord[] | null) ?? [];
  const storeRows = (stores as Array<{ id: string; name: string }> | null) ?? [];
  const saleRows =
    (salesEntries as Array<{
      campaign_id: string;
      target_store_id: string | null;
      weighted_score: number;
    }> | null) ?? [];

  function buildStoreBoard(campaignId: string): StoreScoreRow[] {
    return storeRows
      .map((store) => ({
        id: store.id,
        label: store.name,
        score: saleRows
          .filter((entry) => entry.campaign_id === campaignId && entry.target_store_id === store.id)
          .reduce((sum, entry) => sum + Number(entry.weighted_score ?? 0), 0)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }

  const duelRows = storeRows
    .map((store) => ({
      id: store.id,
      label: store.name,
      score: saleRows
        .filter((entry) => activeStoreCampaigns.some((campaign) => campaign.id === entry.campaign_id) && entry.target_store_id === store.id)
        .reduce((sum, entry) => sum + Number(entry.weighted_score ?? 0), 0)
    }))
    .sort((a, b) => b.score - a.score);

  const headToHead = duelRows.slice(0, 2);

  return (
    <main>
      <h1 className="page-title">Magaza VS Magaza Arenasi</h1>
      <p className="page-subtitle">
        Magaza bazli tum aktif yarislar tek ekranda. Kim onde, kim farki kapatiyor, burada net gorunur.
      </p>

      <section className="versus-hero">
        {headToHead.length === 2 ? (
          <>
            <article className="versus-card lead">
              <span className="badge">Lider Magaza</span>
              <h2>{headToHead[0].label}</h2>
              <strong>{headToHead[0].score.toFixed(0)} puan</strong>
            </article>
            <div className="versus-split">VS</div>
            <article className="versus-card chase">
              <span className="badge">Takipte</span>
              <h2>{headToHead[1].label}</h2>
              <strong>{headToHead[1].score.toFixed(0)} puan</strong>
              <p>Fark: {(headToHead[0].score - headToHead[1].score).toFixed(0)} puan</p>
            </article>
          </>
        ) : (
          <article className="guide-card">
            <h3>Henuz kapisma baslamadi</h3>
            <p>Aktif magaza bazli kampanya olustugunda bu alan dolacak.</p>
          </article>
        )}
      </section>

      <section className="versus-board">
        <article className="leaderboard-card">
          <h3>Genel Magaza Skoru</h3>
          <div className="leaderboard-list">
            {duelRows.slice(0, 8).map((row, index) => (
              <div key={row.id} className="leaderboard-row">
                <div className="leaderboard-rank">{index + 1}</div>
                <div>
                  <h4>{row.label}</h4>
                  <p className="subtle">Tum aktif magaza bazli kampanyalar</p>
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

      <div className="campaign-stack">
        {activeStoreCampaigns.map((campaign) => {
          const board = buildStoreBoard(campaign.id);
          const topProducts = productRows
            .filter((product) => product.campaign_id === campaign.id)
            .slice(0, 3)
            .map((product) => product.name)
            .join(", ");

          return (
            <section key={campaign.id} className="campaign-layout">
              <article className="campaign-card">
                <div className="campaign-header">
                  <div>
                    <div className="status-chip">Magaza Kapismasi</div>
                    <h2>{campaign.name}</h2>
                    <p>{campaign.description ?? "Bu kampanya magazalar arasinda anlik rekabet uretir."}</p>
                  </div>
                  <div>
                    <div className="subtle">Bitise kalan</div>
                    <strong>{daysLeftLabel(campaign.end_at)}</strong>
                  </div>
                </div>

                <div className="battle-grid">
                  <div className="battle-stat-card">
                    <span>Odul Basligi</span>
                    <strong>{campaign.reward_title ?? "Magaza Sampiyonlugu"}</strong>
                    <p>{campaign.reward_first ?? "Buyuk odul lider magazaya"}</p>
                  </div>
                  <div className="battle-stat-card">
                    <span>Bitis</span>
                    <strong>{formatCampaignDateTime(campaign.end_at)}</strong>
                    <p>Magaza skorlari bitisten 10 dk sonra kapanir</p>
                  </div>
                  <div className="battle-stat-card">
                    <span>One cikan urunler</span>
                    <strong>{topProducts || "Urun bekleniyor"}</strong>
                    <p>En fazla katkisi olan urunler burada</p>
                  </div>
                </div>
              </article>

              <aside className="leaderboard-card">
                <h3>Bu Kampanyada Magaza Siralamasi</h3>
                <div className="leaderboard-list">
                  {board.map((row, index) => (
                    <div key={row.id} className="leaderboard-row">
                      <div className="leaderboard-rank">{index + 1}</div>
                      <div>
                        <h4>{row.label}</h4>
                        <p className="subtle">{index === 0 ? "Kampanya lideri" : "Takipte"}</p>
                      </div>
                      <div className="score">
                        <strong>{row.score.toFixed(0)}</strong>
                        <span className="subtle">kampanya puani</span>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            </section>
          );
        })}
      </div>
    </main>
  );
}
