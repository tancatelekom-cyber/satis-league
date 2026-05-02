import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SaleEntryCard } from "@/components/campaign/sale-entry-card";
import { daysLeftLabel, formatCampaignDateTime } from "@/lib/campaign-utils";
import { getCampaignDashboardData } from "@/lib/campaign/get-campaign-dashboard-data";
import { createClient } from "@/lib/supabase/server";

type CampaignDetailPageProps = {
  params: Promise<{
    campaignId: string;
  }>;
  searchParams?: Promise<{
    view?: "leaderboard" | "sales";
    message?: string;
    type?: "success" | "error";
  }>;
};

function scoreLabel(value: number, scoring: "points" | "quantity") {
  return `${value.toFixed(0)} ${scoring === "points" ? "puan" : "adet"}`;
}

export default async function CampaignDetailPage({
  params,
  searchParams
}: CampaignDetailPageProps) {
  const routeParams = await params;
  const pageParams = searchParams ? await searchParams : undefined;
  const view = pageParams?.view === "sales" ? "sales" : "leaderboard";
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

  const activeItem = dashboard.activeLeaderboards.find(
    (item) => item.campaign.id === routeParams.campaignId
  );

  if (!activeItem) {
    notFound();
  }

  const { campaign, leaderboard, personal } = activeItem;
  const menuItems = [
    {
      href: `/kampanyalar/${campaign.id}?view=leaderboard`,
      title: "Kampanya Siralama",
      body: "Canli sira, podyum ve lider farkini gorun.",
      active: view === "leaderboard"
    },
    {
      href: `/kampanyalar/${campaign.id}?view=sales`,
      title: "Kampanya Girisi",
      body: "Urun secip hizli satis girisi yapin.",
      active: view === "sales"
    }
  ];

  return (
    <main>
      <div className="detail-page-head">
        <div>
          <Link className="back-link" href="/kampanyalar">
            Tum Kampanyalara Don
          </Link>
          <h1 className="page-title">{campaign.name}</h1>
          <p className="page-subtitle">
            Bu kampanyada sadece ihtiyaciniz olan adimi secin: siralama veya satis girisi.
          </p>
        </div>
      </div>

      {pageParams?.message ? (
        <div className={`message-box ${pageParams.type === "error" ? "error-box" : "success-box"}`}>
          {pageParams.message}
        </div>
      ) : null}

      <section className="guide-card campaign-detail-summary">
        <div className="season-entry-summary">
          <div className="season-entry-chip">
            <span>Siraniz</span>
            <strong>{personal.rank ? `#${personal.rank}` : "Liste disi"}</strong>
          </div>
          <div className="season-entry-chip">
            <span>Skorunuz</span>
            <strong>{scoreLabel(personal.currentScore, campaign.scoring)}</strong>
          </div>
          <div className="season-entry-chip">
            <span>Lidere fark</span>
            <strong>{scoreLabel(personal.gap, campaign.scoring)}</strong>
          </div>
          <div className="season-entry-chip">
            <span>Bitise kalan</span>
            <strong>{daysLeftLabel(campaign.end_at)}</strong>
          </div>
        </div>

        <div className="campaign-directory-meta">
          <span>
            {campaign.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"} |{" "}
            {campaign.scoring === "points" ? "Puan" : "Adet"}
          </span>
          <span>Bitis: {formatCampaignDateTime(campaign.end_at)}</span>
        </div>
      </section>

      <section className="quick-nav-grid">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            className={`quick-nav-card ${item.active ? "admin-shortcut-card-active" : ""}`}
            href={item.href}
          >
            <strong>{item.title}</strong>
            <span>{item.body}</span>
          </Link>
        ))}
      </section>

      {view === "leaderboard" ? (
        <section className="guide-card">
          <div className="section-title compact-title">
            <div>
              <h2>Kampanya Siralamasi</h2>
              <p>Bu kampanyadaki canli sira burada gorunur.</p>
            </div>
          </div>

          <div className="podium-grid">
            {leaderboard.slice(1, 2).map((row) => (
              <div key={row.id} className="podium-card silver">
                <span>2</span>
                <strong>{row.label}</strong>
                <small>{scoreLabel(row.score, campaign.scoring)}</small>
              </div>
            ))}
            {leaderboard.slice(0, 1).map((row) => (
              <div key={row.id} className="podium-card gold">
                <span>1</span>
                <strong>{row.label}</strong>
                <small>{scoreLabel(row.score, campaign.scoring)}</small>
              </div>
            ))}
            {leaderboard.slice(2, 3).map((row) => (
              <div key={row.id} className="podium-card bronze">
                <span>3</span>
                <strong>{row.label}</strong>
                <small>{scoreLabel(row.score, campaign.scoring)}</small>
              </div>
            ))}
          </div>

          <div className="leaderboard-list">
            {leaderboard.map((row, index) => (
              <div key={row.id} className="leaderboard-row">
                <div className="leaderboard-rank">{index + 1}</div>
                <div>
                  <h4>{row.label}</h4>
                  <p className="subtle">{row.badge ?? "Canli toplam"}</p>
                </div>
                <div className="score">
                  <strong>{row.score.toFixed(0)}</strong>
                  <span className="subtle">
                    toplam {campaign.scoring === "points" ? "puan" : "adet"}
                  </span>
                </div>
              </div>
            ))}
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
                defaultProfileId={dashboard.profile.id}
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
