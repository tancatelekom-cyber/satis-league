import Link from "next/link";
import { redirect } from "next/navigation";
import {
  formatCampaignDateTime,
  isPlannedCampaign,
  timeUntilLabel
} from "@/lib/campaign-utils";
import { createClient } from "@/lib/supabase/server";
import { getCampaignDashboardData } from "@/lib/campaign/get-campaign-dashboard-data";

export const dynamic = "force-dynamic";

type CampaignPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

export default async function CampaignPage({ searchParams }: CampaignPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const dashboard = await getCampaignDashboardData(user.id);

  if (!dashboard) {
    redirect("/hesabim");
  }

  if (dashboard.profile.approval !== "approved") {
    return (
      <main>
        <h1 className="page-title">Gunluk Kampanyalar</h1>
        <p className="page-subtitle">
          Kampanyalari gormek icin once admin onayiniz tamamlanmali.
        </p>
      </main>
    );
  }

  const now = Date.now();
  const strictActiveLeaderboards = dashboard.activeLeaderboards.filter(
    (item) =>
      new Date(item.campaign.start_at).getTime() <= now &&
      new Date(item.campaign.end_at).getTime() >= now
  );

  const summaryCards = strictActiveLeaderboards.map((item) => ({
    id: item.campaign.id,
    name: item.campaign.name,
    rank: item.personal.rank,
    score: item.personal.currentScore,
    gap: item.personal.gap,
    scoring: item.campaign.scoring
  }));

  return (
    <main>
      <h1 className="page-title">Gunluk Kampanyalar</h1>
      <p className="page-subtitle">
        Ilk giriste sadece ozet siralamanizi gorursunuz. Bir kampanyaya girdiginizde siralama
        veya satis girisi adimini secerek devam edersiniz.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <section className="guide-card ranking-summary-card">
        <div className="section-title compact-title">
          <div>
            <h2>Ozet Siralama Bilgisi</h2>
            <p>Hangi kampanyada kacinci oldugunuzu tek bakista gorun.</p>
          </div>
        </div>

        {summaryCards.length > 0 ? (
          <div className="quick-nav-grid">
            {summaryCards.map((item) => (
              <Link key={item.id} className="quick-nav-card" href={`/kampanyalar/${item.id}`}>
                <strong>{item.name}</strong>
                <span>
                  Siraniz: {item.rank ? `#${item.rank}` : "Liste disi"} | Skor:{" "}
                  {item.score.toFixed(0)} {item.scoring === "points" ? "puan" : "adet"}
                </span>
                <span>
                  Lidere fark: {item.gap.toFixed(0)} {item.scoring === "points" ? "puan" : "adet"}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="subtle">Su anda acik kampanya yok. Yeni yaris actiginda burada gorunecek.</p>
        )}
      </section>

      <section className="guide-card">
        <div className="section-title compact-title">
          <div>
            <h2>Aktif Kampanyalar</h2>
            <p>Detaya girmek istediginiz kampanyaya dokunun.</p>
          </div>
        </div>

        {dashboard.activeLeaderboards.length > 0 ? (
          <div className="campaign-directory">
            {dashboard.activeLeaderboards.map(({ campaign, personal, leaderboard }) => (
              <Link
                key={campaign.id}
                className="campaign-directory-card"
                href={`/kampanyalar/${campaign.id}`}
              >
                <div className="campaign-directory-head">
                  <div>
                    <strong>{campaign.name}</strong>
                    <span>
                      {campaign.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"} |{" "}
                      {campaign.scoring === "points" ? "Puan" : "Adet"}
                    </span>
                  </div>
                  <div className="store-status">
                    <span>Siraniz</span>
                    <strong>{personal.rank ? `#${personal.rank}` : "Liste disi"}</strong>
                  </div>
                </div>

                <div className="campaign-directory-meta">
                  <span>
                    Lider: {leaderboard[0]?.label ?? "Henuz veri yok"} | Fark:{" "}
                    {personal.gap.toFixed(0)}
                  </span>
                  <span>Bitis: {formatCampaignDateTime(campaign.end_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="subtle">Acik satis penceresi olan kampanya bulunmuyor.</p>
        )}
      </section>

      <section className="guide-card">
        <div className="section-title compact-title">
          <div>
            <h2>Gecmis Kampanyalar</h2>
            <p>Bitmis kampanyalarda sadece siralama ve bilgi goruntulenir.</p>
          </div>
        </div>

        {dashboard.finishedLeaderboards.length > 0 ? (
          <div className="campaign-directory">
            {dashboard.finishedLeaderboards.map(({ campaign, leaderboard }) => (
              <Link
                key={campaign.id}
                className="campaign-directory-card archive-card"
                href={`/kampanyalar/${campaign.id}`}
              >
                <div className="campaign-directory-head">
                  <div>
                    <strong>{campaign.name}</strong>
                    <span>
                      {campaign.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"} |{" "}
                      {campaign.scoring === "points" ? "Puan" : "Adet"}
                    </span>
                  </div>
                  <div className="store-status">
                    <span>Kazanan</span>
                    <strong>{leaderboard[0]?.label ?? "Veri yok"}</strong>
                  </div>
                </div>

                <div className="campaign-directory-meta">
                  <span>Bitis: {formatCampaignDateTime(campaign.end_at)}</span>
                  <span>Durum: Sadece goruntuleme</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="subtle">Henuz bitmis kampanya yok.</p>
        )}
      </section>

      {dashboard.plannedCampaigns.length > 0 ? (
        <section className="guide-card">
          <h3>Planlanan Kampanyalar</h3>
          <div className="approval-list">
            {dashboard.plannedCampaigns.map((campaign) => (
              <div key={campaign.id} className="approval-row">
                <div>
                  <h4>{campaign.name}</h4>
                  <p className="subtle">
                    {isPlannedCampaign(campaign.start_at) ? timeUntilLabel(campaign.start_at) : ""}
                  </p>
                </div>
                <div className="store-status">
                  <span>Baslangic</span>
                  <strong>{formatCampaignDateTime(campaign.start_at)}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
