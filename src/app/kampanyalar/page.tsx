import Link from "next/link";
import { redirect } from "next/navigation";
import { LiveCampaignCountdown } from "@/components/campaign/live-campaign-countdown";
import {
  formatCampaignDateTime,
  isPlannedCampaign,
  timeUntilLabel
} from "@/lib/campaign-utils";
import { createClient } from "@/lib/supabase/server";
import { getCampaignDashboardData } from "@/lib/campaign/get-campaign-dashboard-data";
import { getDuelDashboardData } from "@/lib/duel/get-duel-dashboard-data";

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
  const duelDashboard = await getDuelDashboardData(user.id);

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

      <section className="guide-card ranking-summary-card campaign-section-card">
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

      {duelDashboard?.activeDuels.length ? (
        <section className="guide-card campaign-section-card">
          <div className="section-title compact-title">
            <div>
              <h2>Aktif Duellolar</h2>
              <p>Secilen kisi veya gruplar arasindaki mini yarislara buradan girin.</p>
            </div>
          </div>

          <div className="campaign-directory">
            {duelDashboard.activeDuels.map((duel) => (
              <Link
                key={duel.id}
                className="campaign-directory-card"
                href={`/kampanyalar/duello/${duel.id}`}
              >
                <div className="campaign-directory-head">
                  <div>
                    <strong>{duel.name}</strong>
                    <span>
                      {duel.scoring === "points" ? "Puan Bazli" : "Adet Bazli"} | {duel.participants.length} taraf
                    </span>
                  </div>
                  <div className="store-status">
                    <span>Lider</span>
                    <strong>{duel.leaderboard[0]?.label ?? "Veri yok"}</strong>
                  </div>
                </div>

                <div className="campaign-directory-meta">
                  <span>
                    Skor: {(duel.leaderboard[0]?.score ?? 0).toFixed(0)}{" "}
                    {duel.scoring === "points" ? "puan" : "adet"}
                  </span>
                  <span>Bitis: {formatCampaignDateTime(duel.end_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {duelDashboard?.finishedDuels.length ? (
        <section className="guide-card campaign-section-card">
          <div className="section-title compact-title">
            <div>
              <h2>Gecmis Duellolar</h2>
              <p>Bitmis duellolarin son siralamasi ve urun dagilimini goruntuleyin.</p>
            </div>
          </div>

          <div className="campaign-directory">
            {duelDashboard.finishedDuels.map((duel) => (
              <Link
                key={duel.id}
                className="campaign-directory-card archive-card"
                href={`/kampanyalar/duello/${duel.id}`}
              >
                <div className="campaign-directory-head">
                  <div>
                    <strong>{duel.name}</strong>
                    <span>{duel.scoring === "points" ? "Puan Bazli" : "Adet Bazli"} duello</span>
                  </div>
                  <div className="store-status">
                    <span>Kazanan</span>
                    <strong>{duel.leaderboard[0]?.label ?? "Veri yok"}</strong>
                  </div>
                </div>

                <div className="campaign-directory-meta">
                  <span>Bitis: {formatCampaignDateTime(duel.end_at)}</span>
                  <span>Durum: Sadece goruntuleme</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {duelDashboard?.plannedDuels.length ? (
        <section className="guide-card campaign-section-card">
          <h3>Planlanan Duellolar</h3>
          <div className="approval-list">
            {duelDashboard.plannedDuels.map((duel) => (
              <div key={duel.id} className="approval-row">
                <div>
                  <h4>{duel.name}</h4>
                  <p className="subtle">
                    {isPlannedCampaign(duel.start_at) ? timeUntilLabel(duel.start_at) : ""}
                  </p>
                </div>
                <div className="store-status">
                  <span>Baslangic</span>
                  <strong>{formatCampaignDateTime(duel.start_at)}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="guide-card campaign-section-card">
        <div className="section-title compact-title">
          <div>
            <h2>Aktif Kampanyalar</h2>
            <p>Detaya girmek istediginiz kampanyaya dokunun.</p>
          </div>
        </div>

        {strictActiveLeaderboards.length > 0 ? (
          <div className="live-campaign-home-list">
            {strictActiveLeaderboards.map(({ campaign, personal, leaderboard }) => (
              <article className="live-campaign-home-card" key={campaign.id}>
                <div className="live-campaign-home-topline">
                  <span className="live-campaign-blink-badge">
                    <span aria-hidden="true" /> CANLI KAMPANYA
                  </span>
                  <span className="live-campaign-end-date">
                    Bitis: {formatCampaignDateTime(campaign.end_at)}
                  </span>
                </div>

                <LiveCampaignCountdown endAt={campaign.end_at} />

                <div className="live-campaign-home-heading">
                  <div>
                    <h3>{campaign.name}</h3>
                    <p>
                      {campaign.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"} |{" "}
                      {campaign.scoring === "points" ? "Puan" : "Adet"}
                    </p>
                  </div>
                  <div className="live-campaign-personal-rank">
                    <span>SIRANIZ</span>
                    <strong>{personal.rank ? `#${personal.rank}` : "-"}</strong>
                  </div>
                </div>

                <div className="live-campaign-top-fifteen">
                  <div className="live-campaign-ranking-head">
                    <strong>ILK 15</strong>
                    <span>{campaign.mode === "employee" ? "Calisan" : "Magaza"}</span>
                    <span>SKOR</span>
                  </div>
                  <ol>
                    {leaderboard.slice(0, 15).map((row, index) => (
                      <li
                        className={
                          row.id ===
                          (campaign.mode === "employee"
                            ? dashboard.profile.id
                            : dashboard.profile.store_id)
                            ? "is-current-user"
                            : ""
                        }
                        key={row.id}
                      >
                        <span className="live-campaign-rank-number">{index + 1}</span>
                        <strong>{row.label}</strong>
                        <span className="live-campaign-rank-score">
                          {row.score.toFixed(0)} {campaign.scoring === "points" ? "puan" : "adet"}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                <Link className="live-campaign-detail-link" href={`/kampanyalar/${campaign.id}`}>
                  Kampanyayi Ac
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="subtle">Acik satis penceresi olan kampanya bulunmuyor.</p>
        )}
      </section>

      <section className="guide-card campaign-section-card">
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
        <section className="guide-card campaign-section-card">
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
