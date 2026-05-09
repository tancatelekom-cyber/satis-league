import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SaleEntryCard } from "@/components/campaign/sale-entry-card";
import { daysLeftLabel, formatCampaignDateTime, isSalesWindowOpen } from "@/lib/campaign-utils";
import { getCampaignDashboardData } from "@/lib/campaign/get-campaign-dashboard-data";
import { createAdminClient } from "@/lib/supabase/admin";
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
    reward_title?: string | null;
    reward_details?: string | null;
    reward_threshold_value?: number | null;
    reward_first?: string | null;
    reward_second?: string | null;
    reward_third?: string | null;
  },
  index: number,
  score: number
) {
  const threshold = Number(campaign.reward_threshold_value ?? 0);
  const reachedThreshold = threshold > 0 && score >= threshold;

  if (reachedThreshold) {
    return campaign.reward_title?.trim() || campaign.reward_details?.trim() || "Odul hak edildi";
  }

  if (index === 0) {
    return threshold > 0 ? null : campaign.reward_first?.trim() || null;
  }

  if (index === 1) {
    return threshold > 0 ? null : campaign.reward_second?.trim() || null;
  }

  if (index === 2) {
    return threshold > 0 ? null : campaign.reward_third?.trim() || null;
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
  const canSubmitToCampaign = campaign.can_submit !== false;
  const admin = createAdminClient();
  const defaultProfileId =
    dashboard.profile.role === "manager" && dashboard.teamProfiles.length > 0
      ? dashboard.teamProfiles[0].id
      : dashboard.profile.id;
  const targetProfileIds =
    campaign.mode === "employee"
      ? dashboard.profile.role === "manager"
        ? dashboard.teamProfiles.map((person) => person.id)
        : [dashboard.profile.id]
      : [];
  const targetStoreIds = campaign.mode === "store" && dashboard.profile.store_id ? [dashboard.profile.store_id] : [];
  const initialQuantityMap: Record<string, number> = {};
  const participantProductTotals = new Map<string, Map<string, number>>();

  const { data: allCampaignEntries } = await admin
    .from("sales_entries")
    .select("product_id, target_profile_id, target_store_id, quantity")
    .eq("campaign_id", campaign.id);

  ((allCampaignEntries as Array<{
    product_id: string;
    target_profile_id: string | null;
    target_store_id: string | null;
    quantity: number;
  }> | null) ?? []).forEach((entry) => {
    const participantId = campaign.mode === "employee" ? entry.target_profile_id : entry.target_store_id;
    if (participantId) {
      const productTotals = participantProductTotals.get(participantId) ?? new Map<string, number>();
      productTotals.set(
        entry.product_id,
        Number(productTotals.get(entry.product_id) ?? 0) + Number(entry.quantity ?? 0)
      );
      participantProductTotals.set(participantId, productTotals);
    }

    if (
      isActiveCampaign &&
      canSubmitToCampaign &&
      ((campaign.mode === "employee" &&
        entry.target_profile_id &&
        targetProfileIds.includes(entry.target_profile_id)) ||
        (campaign.mode === "store" &&
          entry.target_store_id &&
          targetStoreIds.includes(entry.target_store_id)))
    ) {
      const targetId = campaign.mode === "employee" ? entry.target_profile_id : entry.target_store_id;
      const key = `${targetId ?? "none"}__${entry.product_id}`;
      initialQuantityMap[key] = Number(initialQuantityMap[key] ?? 0) + Number(entry.quantity ?? 0);
    }
  });

  const participantSummaryColumns = leaderboard.map((row) => ({
    id: row.id,
    label: row.label
  }));
  const productSummaryMatrix = campaign.products.map((product) => {
    const participantCells = participantSummaryColumns.map((participant) =>
      Number(participantProductTotals.get(participant.id)?.get(product.id) ?? 0)
    );

    return {
      id: product.id,
      name: product.name,
      participantCells,
      total: participantCells.reduce((sum, value) => sum + value, 0)
    };
  });
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

  if (isActiveCampaign && canSubmitToCampaign) {
    menuItems.push({
      href: `/kampanyalar/${campaign.id}?view=sales`,
      title: "Satis Girisi Yap",
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
        <a className="button-secondary export-link-button" href={`/kampanyalar/${campaign.id}/excel`}>
          Excel'e Indir
        </a>
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
              <strong>Odul Esigi</strong>
              <span>
                {campaign.reward_threshold_value
                  ? `${Number(campaign.reward_threshold_value).toFixed(0)} ${
                      campaign.scoring === "points" ? "puan" : "adet"
                    }`
                  : "Odul esigi tanimlanmadi"}
              </span>
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
      ) : !isActiveCampaign || view === "leaderboard" || !canSubmitToCampaign ? (
        <section className="guide-card">
          {isActiveCampaign && !canSubmitToCampaign ? (
            <div className="message-box error-box">
              Bu kampanyada satis girisi sadece adminin yetki verdigi profiller tarafindan yapilabilir.
            </div>
          ) : null}
          <div className="leaderboard-list">
            {leaderboard.map((row, index) => {
              const rewardLabel = campaignRewardLabel(campaign, index, row.score);
              const isLeader = index === 0;
              const rowContent = (
                <>
                  <div className={`leaderboard-rank ${row.score <= 0 ? "leaderboard-rank-empty" : ""}`}>
                    {index + 1}
                  </div>
                  <div>
                    <h4>
                      {row.label}
                      {isLeader ? (
                        <span aria-label="Lider kupasi" className="leaderboard-cup" title="Lider kupasi">
                          {"\uD83C\uDFC6"}
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
                </>
              );

              return isLeader ? (
                <details key={row.id} className="leaderboard-spotlight-card">
                  <summary className="leaderboard-row leaderboard-row-clickable">{rowContent}</summary>
                  <div className="leaderboard-spotlight-visual">
                    <span className="leaderboard-spotlight-cup" aria-hidden="true">
                      {"\uD83C\uDFC6"}
                    </span>
                    <span className="leaderboard-spotlight-campaign">{campaign.name}</span>
                    <span className="leaderboard-spotlight-date">
                      {formatCampaignDateTime(campaign.start_at)} - {formatCampaignDateTime(campaign.end_at)}
                    </span>
                    <strong className="leaderboard-spotlight-name">{row.label}</strong>
                    <div className="leaderboard-spotlight-score">
                      {row.score.toFixed(0)} {campaign.scoring === "points" ? "puan" : "adet"}
                    </div>
                    {rewardLabel ? <div className="leaderboard-spotlight-reward">{rewardLabel}</div> : null}
                  </div>
                </details>
              ) : (
                <div key={row.id} className="leaderboard-row">
                  {rowContent}
                </div>
              );
            })}
          </div>

          <section
            className="live-sale-summary campaign-product-summary"
            aria-label="Kampanya bazli urun ozetleri"
          >
            <div className="live-sale-summary-head">
              <strong>
                {campaign.mode === "employee" ? "Calisan Bazli Urun Ozetleri" : "Magaza Bazli Urun Ozetleri"}
              </strong>
              <span>
                {campaign.mode === "employee"
                  ? "Her calisan icin urun adetlerinin ozet gorunumu"
                  : "Her magaza icin urun adetlerinin ozet gorunumu"}
              </span>
            </div>
            <div className="campaign-matrix-wrap">
              <table className="campaign-matrix-table">
                <thead>
                  <tr>
                    <th>Urun</th>
                    {participantSummaryColumns.map((participant) => (
                      <th key={`matrix-head-${participant.id}`}>{participant.label}</th>
                    ))}
                    <th>Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {productSummaryMatrix.map((product) => (
                    <tr key={`matrix-row-${product.id}`}>
                      <th>{product.name}</th>
                      {product.participantCells.map((value, index) => (
                        <td key={`matrix-cell-${product.id}-${participantSummaryColumns[index]?.id ?? index}`}>
                          {value > 0 ? value : ""}
                        </td>
                      ))}
                      <td className="campaign-matrix-total">{product.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : (
        <section className="guide-card">
          <div className="section-title compact-title">
            <div>
              <h2>Satis Girisi Yap</h2>
              <p>Urun secin ve sadece bu kampanya icin satis girin.</p>
            </div>
          </div>

          <div className="product-list">
            <SaleEntryCard
              campaignId={campaign.id}
              campaignMode={campaign.mode}
              defaultProfileId={defaultProfileId}
              defaultStoreId={dashboard.profile.store_id ?? null}
              initialQuantities={initialQuantityMap}
              isManager={dashboard.profile.role === "manager"}
              products={campaign.products}
              scoring={campaign.scoring}
              teamProfiles={dashboard.teamProfiles}
            />
          </div>
        </section>
      )}
    </main>
  );
}
