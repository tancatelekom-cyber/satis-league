import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SaleEntryCard } from "@/components/campaign/sale-entry-card";
import { daysLeftLabel, formatCampaignDateTime, isSalesWindowOpen } from "@/lib/campaign-utils";
import { getCampaignDashboardData } from "@/lib/campaign/get-campaign-dashboard-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CampaignDetailPageProps = {
  params: Promise<{
    campaignId: string;
  }>;
  searchParams?: Promise<{
    view?: "leaderboard" | "sales" | "details";
    message?: string;
    type?: "success" | "error";
  }>;
};

function scoreLabel(value: number, scoring: "points" | "quantity") {
  return `${value.toFixed(0)} ${scoring === "points" ? "puan" : "adet"}`;
}

function campaignRewardLabel(
  campaign: {
    reward_first?: string | null;
    reward_second?: string | null;
    reward_third?: string | null;
  },
  index: number
) {
  if (index === 0) {
    return campaign.reward_first?.trim() || null;
  }

  if (index === 1) {
    return campaign.reward_second?.trim() || null;
  }

  if (index === 2) {
    return campaign.reward_third?.trim() || null;
  }

  return null;
}

export default async function CampaignDetailPage({
  params,
  searchParams
}: CampaignDetailPageProps) {
  const routeParams = await params;
  const pageParams = searchParams ? await searchParams : undefined;
  const view =
    pageParams?.view === "sales"
      ? "sales"
      : pageParams?.view === "details"
        ? "details"
        : "leaderboard";
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
    redirect("/hesabim");
  }

  const activeItem = dashboard.activeLeaderboards.find((item) => item.campaign.id === routeParams.campaignId);
  const finishedItem = dashboard.finishedLeaderboards.find(
    (item) => item.campaign.id === routeParams.campaignId
  );
  const campaignItem = activeItem ?? finishedItem ?? null;

  if (!campaignItem) {
    notFound();
  }

  const { campaign, leaderboard, personal } = campaignItem;
  const isActiveCampaign = isSalesWindowOpen(campaign.start_at, campaign.end_at);
  const menuItems = [
    {
      href: `/kampanyalar/${campaign.id}?view=leaderboard`,
      title: "Kampanya Siralama",
      active: view === "leaderboard"
    },
    {
      href: `/kampanyalar/${campaign.id}?view=details`,
      title: "Kampanya Detay",
      active: view === "details"
    }
  ];

  if (isActiveCampaign) {
    menuItems.push({
      href: `/kampanyalar/${campaign.id}?view=sales`,
      title: "Kampanya Girisi",
      active: view === "sales"
    });
  }

  return (
    <main>
      <div className="detail-page-head">
        <div>
          <Link className="back-link" href="/kampanyalar">
            Tum Kampanyalara Don
          </Link>
          <h1 className="page-title compact-page-title">{campaign.name}</h1>
        </div>
      </div>

      {pageParams?.message ? (
        <div className={`message-box ${pageParams.type === "error" ? "error-box" : "success-box"}`}>
          {pageParams.message}
        </div>
      ) : null}

      <section className="compact-top-strip">
        <span className="mission-pill">Sira: {personal.rank ? `#${personal.rank}` : "Liste disi"}</span>
        <span className="mission-pill">Skor: {scoreLabel(personal.currentScore, campaign.scoring)}</span>
        <span className="mission-pill">Fark: {scoreLabel(personal.gap, campaign.scoring)}</span>
          <span className="mission-pill">
            {isActiveCampaign ? `Kalan: ${daysLeftLabel(campaign.end_at)}` : "Durum: Gecmis kampanya"}
          </span>
        <span className="mission-pill">
          {campaign.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"} |{" "}
          {campaign.scoring === "points" ? "Puan" : "Adet"}
        </span>
        <span className="mission-pill">Bitis: {formatCampaignDateTime(campaign.end_at)}</span>
      </section>

      <section className="detail-switch-grid compact-switch-grid">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            className={`detail-switch-card compact-switch-card ${item.active ? "admin-shortcut-card-active" : ""}`}
            href={item.href}
          >
            <strong>{item.title}</strong>
          </Link>
        ))}
      </section>

      {view === "details" ? (
        <section className="guide-card">
          <div className="step-list">
            <div className="step-item">
              <strong>Kampanya Aciklamasi</strong>
              <span>{campaign.description ?? "Bu kampanya icin aciklama girilmedi."}</span>
            </div>
            <div className="step-item">
              <strong>Kampanya Turu</strong>
              <span>
                {campaign.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"} |{" "}
                {campaign.scoring === "points" ? "Puan" : "Adet"}
              </span>
            </div>
            <div className="step-item">
              <strong>Baslangic - Bitis</strong>
              <span>
                {formatCampaignDateTime(campaign.start_at)} - {formatCampaignDateTime(campaign.end_at)}
              </span>
            </div>
            <div className="step-item">
              <strong>Odul Basligi</strong>
              <span>{campaign.reward_title ?? "Odul basligi tanimlanmadi"}</span>
            </div>
            <div className="step-item">
              <strong>Odul Detayi</strong>
              <span>{campaign.reward_details ?? "Odul detayi tanimlanmadi"}</span>
            </div>
            <div className="step-item">
              <strong>Podyum Odulleri</strong>
              <span>
                1. Sira: {campaign.reward_first ?? "Tanimlanmadi"} | 2. Sira:{" "}
                {campaign.reward_second ?? "Tanimlanmadi"} | 3. Sira:{" "}
                {campaign.reward_third ?? "Tanimlanmadi"}
              </span>
            </div>
            <div className="step-item">
              <strong>Kampanya Urunleri</strong>
              <span>
                {campaign.products.length > 0
                  ? campaign.products.map((product) => product.name).join(", ")
                  : "Urun tanimlanmadi"}
              </span>
            </div>
          </div>
        </section>
      ) : !isActiveCampaign || view === "leaderboard" ? (
        <section className="guide-card">
          <div className="leaderboard-list">
            {leaderboard.map((row, index) => {
              const rewardLabel = campaignRewardLabel(campaign, index);

              return (
              <div key={row.id} className="leaderboard-row">
                <div className={`leaderboard-rank ${row.score <= 0 ? "leaderboard-rank-empty" : ""}`}>
                  {index + 1}
                </div>
                <div>
                  <h4>
                    {row.label}
                    {index === 0 ? (
                      <span aria-label="Lider kupasi" className="leaderboard-cup" title="Lider kupasi">
                        🏆
                      </span>
                    ) : null}
                  </h4>
                  <p className="subtle">{row.badge ?? "Canli toplam"}</p>
                  {rewardLabel ? <div className="leaderboard-reward">{rewardLabel}</div> : null}
                </div>
                <div className="score">
                  <strong>{row.score.toFixed(0)}</strong>
                  <span className="subtle">
                    toplam {campaign.scoring === "points" ? "puan" : "adet"}
                  </span>
                </div>
              </div>
            )})}
          </div>
        </section>
      ) : (
        <section className="guide-card">
          <div className="section-title compact-title">
            <div>
              <h2>Kampanya Girisi</h2>
              <p>Urun secin ve sadece bu kampanya icin satis girin.</p>
            </div>
          </div>

          <div className="product-list">
            {campaign.products.map((product) => (
              <SaleEntryCard
                key={product.id}
                campaignId={campaign.id}
                campaignMode={campaign.mode}
                defaultProfileId={
                  dashboard.profile.role === "manager" && dashboard.teamProfiles.length > 0
                    ? dashboard.teamProfiles[0].id
                    : dashboard.profile.id
                }
                defaultStoreId={dashboard.profile.store_id ?? null}
                isManager={dashboard.profile.role === "manager"}
                product={product}
                scoring={campaign.scoring}
                teamProfiles={dashboard.teamProfiles}
                redirectTo={`/kampanyalar/${campaign.id}?view=sales`}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
