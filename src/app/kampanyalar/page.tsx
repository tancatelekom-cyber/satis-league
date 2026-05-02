import Link from "next/link";
import { redirect } from "next/navigation";
import { SaleEntryCard } from "@/components/campaign/sale-entry-card";
import {
  daysLeftLabel,
  formatCampaignDateTime,
  isPlannedCampaign,
  isRecentFinishedCampaign,
  isSalesWindowOpen,
  timeUntilLabel
} from "@/lib/campaign-utils";
import { roleLabels } from "@/lib/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CampaignPageCampaign, CampaignProductRecord, LeaderboardRow, ProfileSummary } from "@/lib/types";

type CampaignPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

type SalesEntryRecord = {
  campaign_id: string;
  target_profile_id: string | null;
  target_store_id: string | null;
  weighted_score: number;
  quantity: number;
  created_at: string;
};

type ApprovedProfileRecord = {
  id: string;
  full_name: string;
  role: string;
  store_id: string | null;
  approval?: string;
  is_on_leave: boolean;
};

type ActiveStoreRecord = {
  id: string;
  name: string;
  is_active?: boolean;
};

function withBadges(rows: LeaderboardRow[]) {
  return rows.map((row, index) => ({
    ...row,
    badge: index === 0 ? "Lider" : index === 1 ? "Takipte" : index === 2 ? "Yukseliste" : "Atakta"
  }));
}

function scoreLabel(value: number, scoring: "points" | "quantity") {
  return `${value.toFixed(0)} ${scoring === "points" ? "puan" : "adet"}`;
}

function buildAchievements(options: {
  overallScore: number;
  bestRank: number | null;
  activeCount: number;
  isManager: boolean;
  hasPlannedCampaign: boolean;
}) {
  const items = [];

  if (options.overallScore >= 100) {
    items.push({ title: "100'ler Kulubu", body: "Bu sezon 100 puan barajini gectiniz." });
  }

  if (options.bestRank === 1) {
    items.push({ title: "Taht Koruyucu", body: "En az bir arenada zirveyi aldiniz." });
  } else if (options.bestRank && options.bestRank <= 3) {
    items.push({ title: "Podyumcu", body: "Ilk 3 icinde yerinizi almissiniz." });
  }

  if (options.activeCount >= 2) {
    items.push({ title: "Cift Arena", body: "Ayni anda birden fazla kampanyada yarisiyorsunuz." });
  }

  if (options.isManager) {
    items.push({ title: "Takim Kaptani", body: "Ekibiniz adina skor yonetebiliyorsunuz." });
  }

  if (options.hasPlannedCampaign) {
    items.push({ title: "Hazir Kivam", body: "Siradaki kampanya icin pozisyon alinmis durumda." });
  }

  return items.slice(0, 4);
}

export default async function CampaignPage({ searchParams }: CampaignPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data } = await admin
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
        store_id,
        store:stores(name)
      `
    )
    .eq("id", user.id)
    .single();

  const profile = (data as (ProfileSummary & { store_id?: string | null }) | null) ?? null;

  if (!profile) {
    redirect("/hesabim");
  }

  const approvedProfile = profile;

  if (approvedProfile.approval !== "approved") {
    return (
      <main>
        <h1 className="page-title">Kampanya Oyunu Ekrani</h1>
        <p className="page-subtitle">
          Kampanyalari gormek icin once admin onayiniz tamamlanmali.
        </p>
      </main>
    );
  }

  const [{ data: campaigns }, { data: salesEntries }, { data: approvedProfiles }, { data: activeStores }] =
    await Promise.all([
      admin
        .from("campaigns")
        .select("id, name, description, mode, scoring, start_date, end_date, start_at, end_at, reward_title, reward_details, reward_first, reward_second, reward_third, is_active")
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      admin
        .from("sales_entries")
        .select("campaign_id, target_profile_id, target_store_id, weighted_score, quantity, created_at"),
      admin
        .from("profiles")
        .select("id, full_name, role, store_id, approval, is_on_leave")
        .eq("approval", "approved"),
      admin.from("stores").select("id, name, is_active").eq("is_active", true)
    ]);

  const allCampaignRows = ((campaigns as CampaignPageCampaign[] | null) ?? []).filter(
    (item) =>
      item.is_active &&
      (isPlannedCampaign(item.start_at) ||
        isSalesWindowOpen(item.start_at, item.end_at) ||
        isRecentFinishedCampaign(item.end_at))
  );
  const campaignIds = allCampaignRows.map((campaign) => campaign.id);
  const { data: products } = campaignIds.length
    ? await admin
        .from("campaign_products")
        .select("id, campaign_id, name, unit_label, base_points, sort_order")
        .in("campaign_id", campaignIds)
        .order("sort_order")
    : { data: [] as CampaignProductRecord[] };

  const productRows = (products as CampaignProductRecord[] | null) ?? [];
  const approvedPeople = (approvedProfiles as ApprovedProfileRecord[] | null) ?? [];
  const saleRows = (salesEntries as SalesEntryRecord[] | null) ?? [];
  const storeRows = (activeStores as ActiveStoreRecord[] | null) ?? [];
  const teamProfiles =
    approvedProfile.role === "manager"
      ? approvedPeople.filter(
          (person) => person.store_id === approvedProfile.store_id && !person.is_on_leave
        )
      : [];

  const campaignCards = allCampaignRows.map((campaign) => ({
    ...campaign,
    products: productRows.filter((product) => product.campaign_id === campaign.id)
  }));
  const plannedCampaigns = campaignCards.filter((campaign) => isPlannedCampaign(campaign.start_at));
  const activeCampaigns = campaignCards.filter((campaign) =>
    isSalesWindowOpen(campaign.start_at, campaign.end_at)
  );
  const finishedCampaigns = campaignCards.filter((campaign) =>
    isRecentFinishedCampaign(campaign.end_at)
  );

  function buildLeaderboard(campaign: CampaignPageCampaign): LeaderboardRow[] {
    if (campaign.mode === "employee") {
      return withBadges(
        approvedPeople
          .filter((person) => !person.is_on_leave)
          .map((person) => {
            const total = saleRows
              .filter(
                (entry) => entry.campaign_id === campaign.id && entry.target_profile_id === person.id
              )
              .reduce((sum, entry) => sum + Number(entry.weighted_score ?? 0), 0);

            return {
              id: person.id,
              label: person.full_name,
              score: total
            };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
      );
    }

    return withBadges(
      storeRows
        .map((store) => {
          const total = saleRows
            .filter(
              (entry) => entry.campaign_id === campaign.id && entry.target_store_id === store.id
            )
            .reduce((sum, entry) => sum + Number(entry.weighted_score ?? 0), 0);

          return {
            id: store.id,
            label: store.name,
            score: total
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
    );
  }

  function buildPersonalStats(campaign: CampaignPageCampaign, leaderboard: LeaderboardRow[]) {
    const participantId =
      campaign.mode === "employee" ? approvedProfile.id : approvedProfile.store_id;
    const currentRow = leaderboard.find((row) => row.id === participantId);
    const rank = currentRow ? leaderboard.findIndex((row) => row.id === currentRow.id) + 1 : null;
    const leaderScore = leaderboard[0]?.score ?? 0;
    const currentScore = currentRow?.score ?? 0;
    const gap = Math.max(0, leaderScore - currentScore);
    const nextRival = rank && rank > 1 ? leaderboard[rank - 2] : null;
    const nextGap = nextRival ? Math.max(0, nextRival.score - currentScore) : 0;

    return {
      currentScore,
      rank,
      gap,
      nextGap,
      leaderLabel: leaderboard[0]?.label ?? "Lider yok",
      nextLabel: nextRival?.label ?? "Zirve"
    };
  }

  const activeLeaderboards = activeCampaigns.map((campaign) => {
    const leaderboard = buildLeaderboard(campaign);
    return {
      campaign,
      leaderboard,
      personal: buildPersonalStats(campaign, leaderboard)
    };
  });

  const spotlight = activeLeaderboards[0] ?? null;
  const overallScore = activeLeaderboards.reduce((sum, item) => sum + item.personal.currentScore, 0);
  const bestRank =
    activeLeaderboards
      .map((item) => item.personal.rank)
      .filter((rank): rank is number => Boolean(rank))
      .sort((a, b) => a - b)[0] ?? null;
  const streakLevel = activeLeaderboards.filter((item) => item.personal.currentScore > 0).length;
  const achievements = buildAchievements({
    overallScore,
    bestRank,
    activeCount: activeCampaigns.length,
    isManager: approvedProfile.role === "manager",
    hasPlannedCampaign: plannedCampaigns.length > 0
  });
  const rewardShowcase = spotlight
    ? [
        {
          title: spotlight.campaign.reward_title ?? "1. Sira",
          reward: spotlight.campaign.reward_first ?? "Buyuk odul + vitrin duyurusu",
          tone: "gold"
        },
        {
          title: "2. Sira",
          reward: spotlight.campaign.reward_second ?? "Prim havuzu ve kutlama karti",
          tone: "silver"
        },
        {
          title: "3. Sira",
          reward: spotlight.campaign.reward_third ?? "Surpriz hediye cekilisi",
          tone: "bronze"
        }
      ]
    : [
        { title: "1. Sira", reward: "Buyuk odul + vitrin duyurusu", tone: "gold" },
        { title: "2. Sira", reward: "Prim havuzu ve kutlama karti", tone: "silver" },
        { title: "3. Sira", reward: "Surpriz hediye cekilisi", tone: "bronze" }
      ];
  const todayKey = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const todaySales = saleRows.filter((entry) => {
    const createdKey = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(entry.created_at));

    const matchesProfile = entry.target_profile_id === approvedProfile.id;
    const matchesStore = entry.target_store_id === approvedProfile.store_id;
    return createdKey === todayKey && (matchesProfile || matchesStore);
  });
  const todayScore = todaySales.reduce((sum, entry) => sum + Number(entry.weighted_score ?? 0), 0);
  const todayEntries = todaySales.length;
  const dailyTasks = [
    {
      title: "Bugunun ilk hedefi",
      progress: `${todayEntries}/3 giris`,
      done: todayEntries >= 3
    },
    {
      title: "Mini puan sprinti",
      progress: `${todayScore.toFixed(0)}/50 puan`,
      done: todayScore >= 50
    },
    {
      title: "Lidere yaklas",
      progress: spotlight ? `${spotlight.personal.gap.toFixed(0)} puan fark` : "Arena bekleniyor",
      done: spotlight ? spotlight.personal.gap <= 10 : false
    }
  ];
  const quickLinks = [
    {
      href: "/kampanyalar",
      title: "Canli Siralama",
      body: "Acik kampanyalarda anlik liderligi ve kendi yerinizi gorun."
    },
    {
      href: "/lig",
      title: "Sezon Ligi",
      body: "Aktif sezon puanlarini ve genel sezon podyumunu acin."
    },
    {
      href: "/bildirimler",
      title: "Bildirimler",
      body: "Admin duyurulari, kampanya guncellemeleri ve onay mesajlari."
    },
    {
      href: "/hesabim",
      title: "Hesabim",
      body: "Rol, magaza ve onay durumunuzu hizlica kontrol edin."
    }
  ];

  return (
    <main>
      <h1 className="page-title">Kampanya Oyunu Ekrani</h1>
      <p className="page-subtitle">
        Ilk ekranda kampanya siralamalari acik gelir. Diger alanlara ise menuden veya hizli
        gecis kartlarindan ilerleyebilirsiniz.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <section className="quick-nav-grid">
        {quickLinks.map((link) => (
          <Link key={link.href} className="quick-nav-card" href={link.href}>
            <strong>{link.title}</strong>
            <span>{link.body}</span>
          </Link>
        ))}
      </section>

      {activeLeaderboards.length > 0 ? (
        <section className="guide-card ranking-focus-card">
          <div className="section-title compact-title">
            <div>
              <h2>Canli Kampanya Siralamalari</h2>
              <p>Giris sonrasi once anlik yaris durumunu gorursunuz.</p>
            </div>
          </div>

          <div className="ranking-focus-grid">
            {activeLeaderboards.map(({ campaign, leaderboard, personal }) => (
              <article key={campaign.id} className="ranking-focus-item">
                <div className="ranking-focus-head">
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

                <div className="leaderboard-list compact-leaderboard">
                  {leaderboard.slice(0, 5).map((row, index) => (
                    <div key={row.id} className="leaderboard-row">
                      <div className="leaderboard-rank">{index + 1}</div>
                      <div>
                        <h4>{row.label}</h4>
                        <p className="subtle">{row.badge ?? "Canli toplam"}</p>
                      </div>
                      <div className="score">
                        <strong>{row.score.toFixed(0)}</strong>
                        <span className="subtle">
                          {campaign.scoring === "points" ? "puan" : "adet"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="game-hub">
        <article className="player-spotlight">
          <div className="player-spotlight-copy">
            <span className="badge">Saha Modu Acik</span>
            <h2>{approvedProfile.full_name}</h2>
            <p>
              {roleLabels[approvedProfile.role]} | {approvedProfile.store?.name ?? "Magaza yok"}
            </p>
          </div>

          <div className="spotlight-grid">
            <div className="spotlight-stat">
              <span>Acik arena</span>
              <strong>{activeCampaigns.length}</strong>
            </div>
            <div className="spotlight-stat">
              <span>Toplam sezon puani</span>
              <strong>{overallScore.toFixed(0)}</strong>
            </div>
            <div className="spotlight-stat">
              <span>En iyi sira</span>
              <strong>{bestRank ? `#${bestRank}` : "Henuz yok"}</strong>
            </div>
          </div>
        </article>

        <article className="mission-card">
          <div className="mission-card-header">
            <span className="status-chip">Bugunun gorevi</span>
            <strong>{spotlight ? spotlight.campaign.name : "Yeni kampanya bekleniyor"}</strong>
          </div>
          <p>
            {spotlight
              ? spotlight.personal.rank === 1
                ? "Zirvedesiniz. Takibi koparmamak icin hizli girislerle farki acin."
                : `${spotlight.personal.nextLabel} ile aranizda ${spotlight.personal.nextGap.toFixed(0)} puan var. Bir urun girisiyle yukselebilirsiniz.`
              : "Admin yeni kampanya actiginda bu alan gunluk hedefi gosterecek."}
          </p>
          <div className="mission-pills">
            <span className="mission-pill">Planlanan: {plannedCampaigns.length}</span>
            <span className="mission-pill">Sonuclanan: {finishedCampaigns.length}</span>
            <span className="mission-pill">
              Izin durumu: {approvedProfile.is_on_leave ? "Listeden gizli" : "Sahadasiniz"}
            </span>
          </div>
        </article>
      </section>

      <section className="momentum-grid">
        <article className="combo-card">
          <div className="combo-head">
            <span className="status-chip">Sicak Seri</span>
            <strong>x{Math.max(1, streakLevel)}</strong>
          </div>
          <p>
            {streakLevel > 0
              ? `${streakLevel} aktif arenada skorunuz var. Seri bozulmadan devam edin.`
              : "Ilk skoru girince seri sayaci calismaya baslar."}
          </p>
          <div className="combo-track">
            {[0, 1, 2, 3].map((step) => (
              <div
                key={step}
                className={`combo-node ${step < Math.max(1, streakLevel) ? "filled" : ""}`}
              />
            ))}
          </div>
        </article>

        <article className="radar-card">
          <h3>Rakip Radari</h3>
          <p>
            {spotlight
              ? spotlight.personal.rank === 1
                ? `${spotlight.personal.leaderLabel} olarak zirvedesiniz. Farki acmaya oynayin.`
                : `${spotlight.personal.nextLabel} size en yakin rakip. Aradaki fark ${spotlight.personal.nextGap.toFixed(0)} puan.`
              : "Aktif arena acildiginda en yakin rakibiniz burada gorunecek."}
          </p>
          <div className="mission-pills">
            <span className="mission-pill">
              Lider: {spotlight ? spotlight.personal.leaderLabel : "Bekleniyor"}
            </span>
            <span className="mission-pill">
              Fark: {spotlight ? spotlight.personal.gap.toFixed(0) : "0"}
            </span>
          </div>
        </article>
      </section>

      <section className="momentum-grid">
        <article className="achievement-card">
          <h3>Gunluk Gorevler</h3>
          <div className="achievement-list">
            {dailyTasks.map((task) => (
              <div key={task.title} className="achievement-item">
                <strong>{task.title}</strong>
                <span>{task.progress}</span>
                <span className={`task-pill ${task.done ? "done" : ""}`}>
                  {task.done ? "Tamamlandi" : "Devam ediyor"}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="achievement-card">
          <h3>Rozetleriniz</h3>
          <div className="achievement-list">
            {achievements.length > 0 ? (
              achievements.map((achievement) => (
                <div key={achievement.title} className="achievement-item">
                  <strong>{achievement.title}</strong>
                  <span>{achievement.body}</span>
                </div>
              ))
            ) : (
              <div className="achievement-item">
                <strong>Ilk Rozet Bekliyor</strong>
                <span>Bir satis girince ve siralamaya girince rozetler acilmaya baslar.</span>
              </div>
            )}
          </div>
        </article>

        <article className="reward-card">
          <h3>Odul Vitrini</h3>
          <p>{spotlight?.campaign.reward_details ?? "Bu kampanyada kazanilacak oduller burada sergilenir."}</p>
          <div className="reward-list">
            {rewardShowcase.map((reward) => (
              <div key={reward.title} className={`reward-item ${reward.tone}`}>
                <strong>{reward.title}</strong>
                <span>{reward.reward}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      {campaignCards.length === 0 ? (
        <section className="guide-card">
          <h3>Aktif kampanya bulunamadi</h3>
          <p>Admin panelinden yeni kampanya actiginizda burada otomatik gorunecek.</p>
        </section>
      ) : (
        <div className="campaign-stack">
          {plannedCampaigns.length > 0 ? (
            <section className="guide-card">
              <h3>Planlanan Kampanyalar</h3>
              <div className="approval-list">
                {plannedCampaigns.map((campaign) => (
                  <div key={campaign.id} className="approval-row">
                    <div>
                      <h4>{campaign.name}</h4>
                      <p>
                        {campaign.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"} |{" "}
                        {campaign.scoring === "points" ? "Puan" : "Adet"}
                      </p>
                      <p className="subtle">
                        Baslayacak: {formatCampaignDateTime(campaign.start_at)}
                      </p>
                    </div>
                    <div className="store-status">
                      <span>Kalan sure</span>
                      <strong>{timeUntilLabel(campaign.start_at)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {activeLeaderboards.map(({ campaign, leaderboard, personal }) => {
            const podium = leaderboard.slice(0, 3);

            return (
              <section key={campaign.id} className="campaign-layout">
                <aside className="leaderboard-card">
                  <h3>Liderlik Arenasi</h3>
                  <p>
                    {campaign.mode === "employee"
                      ? "Calisan bazli kampanyada personel siralamasi burada gorunur."
                      : "Magaza bazli kampanyada magaza siralamasi burada gorunur."}
                  </p>

                  {podium.length > 0 ? (
                    <div className="podium-grid">
                      {podium.slice(1, 2).map((row) => (
                        <div key={row.id} className="podium-card silver">
                          <span>2</span>
                          <strong>{row.label}</strong>
                          <small>{scoreLabel(row.score, campaign.scoring)}</small>
                        </div>
                      ))}
                      {podium.slice(0, 1).map((row) => (
                        <div key={row.id} className="podium-card gold">
                          <span>1</span>
                          <strong>{row.label}</strong>
                          <small>{scoreLabel(row.score, campaign.scoring)}</small>
                        </div>
                      ))}
                      {podium.slice(2, 3).map((row) => (
                        <div key={row.id} className="podium-card bronze">
                          <span>3</span>
                          <strong>{row.label}</strong>
                          <small>{scoreLabel(row.score, campaign.scoring)}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}

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
                </aside>

                <article className="campaign-card">
                  <div className="campaign-header">
                    <div>
                      <div className="status-chip">Aktif Kampanya</div>
                      <h2>{campaign.name}</h2>
                      <p>{campaign.description ?? "Aciklama girilmedi."}</p>
                    </div>

                    <div>
                      <div className="subtle">Bitise kalan</div>
                      <strong>{daysLeftLabel(campaign.end_at)}</strong>
                    </div>
                  </div>

                  <div className="battle-grid">
                    <div className="battle-stat-card">
                      <span>Sizin skorunuz</span>
                      <strong>{personal.currentScore.toFixed(0)}</strong>
                      <p>{campaign.scoring === "points" ? "puan" : "adet"} toplandi</p>
                    </div>
                    <div className="battle-stat-card">
                      <span>Anlik sira</span>
                      <strong>{personal.rank ? `#${personal.rank}` : "Liste disi"}</strong>
                      <p>{personal.rank === 1 ? "Zirvedesiniz" : "Yukselis devam ediyor"}</p>
                    </div>
                    <div className="battle-stat-card">
                      <span>Lidere fark</span>
                      <strong>{personal.gap.toFixed(0)}</strong>
                      <p>{campaign.scoring === "points" ? "puan" : "adet"} kapatilmali</p>
                    </div>
                  </div>

                  <div className="panel-card game-brief-card">
                    <p>
                      <strong>Kampanya tipi:</strong>{" "}
                      {campaign.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"}
                    </p>
                    <p>
                      <strong>Olcum sekli:</strong>{" "}
                      {campaign.scoring === "points" ? "Puan" : "Adet"}
                    </p>
                    <p>
                      <strong>Baslangic:</strong> {formatCampaignDateTime(campaign.start_at)}
                    </p>
                    <p>
                      <strong>Bitis:</strong> {formatCampaignDateTime(campaign.end_at)}
                    </p>
                    <p>
                      <strong>Hedef mesaj:</strong>{" "}
                      {personal.rank === 1
                        ? "Farki koru ve liderligi kilitle."
                        : `${personal.nextLabel} ile aradaki ${personal.nextGap.toFixed(0)} puani kapat.`}
                    </p>
                  </div>

                  <div className="section-title">
                    <div>
                      <h2>Hizli Skor Girisleri</h2>
                      <p>Artik miktari + ve - ile artirip tek tusla skoru isleyebilirsiniz.</p>
                    </div>
                  </div>

                  <div className="product-list">
                    {campaign.products.map((product) => (
                      <SaleEntryCard
                        key={product.id}
                        campaignId={campaign.id}
                        campaignMode={campaign.mode}
                        defaultProfileId={approvedProfile.id}
                        defaultStoreId={approvedProfile.store_id ?? null}
                        isManager={approvedProfile.role === "manager"}
                        product={product}
                        scoring={campaign.scoring}
                        teamProfiles={teamProfiles.map((person) => ({
                          id: person.id,
                          full_name: person.full_name
                        }))}
                      />
                    ))}
                  </div>
                </article>
              </section>
            );
          })}

          {finishedCampaigns.length > 0 ? (
            <section className="guide-card">
              <h3>Sonuclanan Kampanyalar</h3>
              <p>Bitisinden sonraki 12 saat boyunca burada gorunur.</p>
              <div className="approval-list">
                {finishedCampaigns.map((campaign) => {
                  const leaderboard = buildLeaderboard(campaign);
                  const winner = leaderboard[0];

                  return (
                    <div key={campaign.id} className="approval-row">
                      <div>
                        <h4>{campaign.name}</h4>
                        <p className="subtle">Bitti: {formatCampaignDateTime(campaign.end_at)}</p>
                        <p>
                          Kazanan:{" "}
                          {winner
                            ? `${winner.label} (${winner.score.toFixed(0)} puan)`
                            : "Henuz veri yok"}
                        </p>
                      </div>
                      <div className="store-status">
                        <span>Durum</span>
                        <strong>Sonuclandi</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}
