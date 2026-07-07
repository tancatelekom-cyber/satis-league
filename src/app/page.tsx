import { canShowAutoPopupForRole, getAutoPopupSettingsMap } from "@/lib/auto-popup-settings";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { getCampaignDashboardData } from "@/lib/campaign/get-campaign-dashboard-data";
import { fetchDocumentIssueRows, sameDocumentIssueProfileId, sameDocumentIssueStore } from "@/lib/document-issues";
import { buildGoalReminderPopup } from "@/lib/goal-popup-reminders";
import { getActivePopupAnnouncementsForProfile, type PopupAnnouncementRecord } from "@/lib/popup-announcements";
import { createAdminClient } from "@/lib/supabase/admin";
import { SeasonRecord, type UserRole } from "@/lib/types";
import { HomePopupAnnouncement } from "@/components/home-popup-announcement";

export const dynamic = "force-dynamic";

type SeasonSaleRow = {
  season_id: string;
  target_profile_id: string | null;
  target_store_id: string | null;
  score: number;
  entry_date: string;
};

type HomeLeaderCard = {
  seasonId: string;
  seasonName: string;
  winnerName: string;
  score: number;
  monthLabel: string;
  href: string;
};

const MONTH_LABELS = [
  "Ocak",
  "Subat",
  "Mart",
  "Nisan",
  "Mayis",
  "Haziran",
  "Temmuz",
  "Agustos",
  "Eylul",
  "Ekim",
  "Kasim",
  "Aralik"
];

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampDate(value: string, min: string, max: string) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function buildMonthHref(seasonId: string, monthKey: string) {
  const year = monthKey.slice(0, 4);
  return `/lig?seasonId=${seasonId}&period=month&year=${year}&month=${monthKey}`;
}

function getProfileStoreName(
  store: Array<{ name: string }> | { name: string } | null | undefined
) {
  if (Array.isArray(store)) {
    return store[0]?.name ?? null;
  }

  return store?.name ?? null;
}

function buildDocumentIssuePopup(
  fullName: string,
  unreachableCount: number,
  missingCount: number,
  scope: "employee" | "store" | "company"
): PopupAnnouncementRecord | null {
  const total = unreachableCount + missingCount;

  if (total <= 0) {
    return null;
  }

  const lines: string[] = [`Sayin ${fullName},`];

  if (unreachableCount > 0) {
    lines.push(
      scope === "employee"
        ? `Ulasmayan evrak adetiniz: ${unreachableCount}`
        : scope === "store"
          ? `Magazaniza ait ulasmayan evrak adedi: ${unreachableCount}`
          : `Firma geneli ulasmayan evrak adedi: ${unreachableCount}`
    );
  }
  if (missingCount > 0) {
    lines.push(
      scope === "employee"
        ? `Eksik evrak adetiniz: ${missingCount}`
        : scope === "store"
          ? `Magazaniza ait eksik evrak adedi: ${missingCount}`
          : `Firma geneli eksik evrak adedi: ${missingCount}`
    );
  }

  lines.push("Lutfen onceliklerimiz arasina alalim ve bugun tamamlamak icin gerekli aksiyonlari alalim.");

  return {
    id: `document-issues-${unreachableCount}-${missingCount}`,
    title: "Evrak Uyarisi",
    body: lines.join("\n"),
    link_url: "/eksik-evrak",
    image_path: null,
    imageUrl: null,
    target_roles: ["employee", "manager", "management", "admin"] satisfies UserRole[],
    show_from: new Date().toISOString(),
    show_until: new Date().toISOString(),
    is_active: true,
    created_at: new Date().toISOString()
  };
}

function buildInactiveLoginPopup(fullName: string, inactiveDays: number): PopupAnnouncementRecord | null {
  if (inactiveDays < 2) {
    return null;
  }

  return {
    id: `inactive-login-${inactiveDays}`,
    title: "Portal Hatirlatmasi",
    body: [
      `Sayin ${fullName},`,
      `${inactiveDays} gundur portala giris yapmadiginiz goruntulenmistir.`,
      "Hedef gerceklesen ve kazanc takibiniz icin gunluk girisinizi rica ederiz.",
      "Bol satislar dileriz."
    ].join("\n"),
    link_url: null,
    image_path: null,
    imageUrl: null,
    target_roles: ["employee", "manager", "management", "admin"] satisfies UserRole[],
    show_from: new Date().toISOString(),
    show_until: new Date().toISOString(),
    is_active: true,
    created_at: new Date().toISOString()
  };
}

export default async function HomePage() {
  const user = await requireUser();

  const admin = createAdminClient();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = `${MONTH_LABELS[now.getMonth()]} ${now.getFullYear()}`;
  const monthStart = toDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = toDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const campaignDashboardPromise = getCampaignDashboardData(user.id);
  const seasonDataPromise = Promise.all([
    admin
      .from("seasons")
      .select("id, name, start_date, end_date, mode, is_active, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    admin
      .from("profiles")
      .select("id, full_name, approval, role, is_on_leave, store_id")
      .eq("approval", "approved"),
    admin.from("stores").select("id, name").eq("is_active", true),
    admin
      .from("season_sales_entries")
      .select("season_id, target_profile_id, target_store_id, score, entry_date")
      .gte("entry_date", monthStart)
      .lte("entry_date", monthEnd)
  ]);

  const campaignDashboard = await campaignDashboardPromise;
  const autoPopupSettingsMap =
    campaignDashboard?.profile.approval === "approved" ? await getAutoPopupSettingsMap() : new Map();
  const activePopupAnnouncementsPromise =
    campaignDashboard?.profile.approval === "approved"
      ? getActivePopupAnnouncementsForProfile(campaignDashboard.profile)
      : Promise.resolve([]);
  const inactiveLoginPopupPromise =
    campaignDashboard?.profile.approval === "approved" &&
    canShowAutoPopupForRole(autoPopupSettingsMap, "inactive-login-reminder", campaignDashboard.profile.role)
      ? Promise.resolve(
          (() => {
            const lastSignInAt = user.last_sign_in_at ? new Date(user.last_sign_in_at) : null;

            if (!lastSignInAt || Number.isNaN(lastSignInAt.getTime())) {
              return null;
            }

            const inactiveDays = Math.floor((now.getTime() - lastSignInAt.getTime()) / (1000 * 60 * 60 * 24));
            return buildInactiveLoginPopup(campaignDashboard.profile.full_name || "Calisan", inactiveDays);
          })()
        )
      : Promise.resolve(null);
  const documentIssuePopupPromise =
    campaignDashboard?.profile.approval === "approved" &&
    canShowAutoPopupForRole(autoPopupSettingsMap, "document-issue-reminder", campaignDashboard.profile.role)
      ? (async () => {
          try {
            const rows = await fetchDocumentIssueRows();
            const role = campaignDashboard.profile.role;
            const fullName = campaignDashboard.profile.full_name || "Calisan";
            const storeName = getProfileStoreName(
              campaignDashboard.profile.store as Array<{ name: string }> | { name: string } | null | undefined
            );

            const scopedRows =
              role === "employee"
                ? rows.filter((row) => sameDocumentIssueProfileId(row.personnelId, user.id))
                : role === "manager"
                  ? storeName
                    ? rows.filter((row) => sameDocumentIssueStore(row.storeName, storeName))
                    : []
                  : rows;

            const unreachableCount = scopedRows.filter((row) => row.source === "Ulasmayan Evrak").length;
            const missingCount = scopedRows.filter((row) => row.source === "Eksik Evrak").length;

            return buildDocumentIssuePopup(
              fullName,
              unreachableCount,
              missingCount,
              role === "employee" ? "employee" : role === "manager" ? "store" : "company"
            );
          } catch {
            return null;
          }
        })()
      : Promise.resolve(null);
  const goalReminderPopupPromise =
    campaignDashboard?.profile.approval === "approved" &&
    canShowAutoPopupForRole(autoPopupSettingsMap, "goal-daily-need-reminder", campaignDashboard.profile.role)
      ? buildGoalReminderPopup({
          role: campaignDashboard.profile.role,
          fullName: campaignDashboard.profile.full_name || "Calisan",
          personnelId: user.id,
          storeName: getProfileStoreName(
            campaignDashboard.profile.store as Array<{ name: string }> | { name: string } | null | undefined
          )
        }).catch(() => null)
      : Promise.resolve(null);
  const liveCampaignLeaderboard =
    campaignDashboard?.profile.approval === "approved"
      ? campaignDashboard.activeLeaderboards.find(
          (item) =>
            new Date(item.campaign.start_at).getTime() <= now.getTime() &&
            new Date(item.campaign.end_at).getTime() >= now.getTime()
        ) ?? null
      : null;

  const [{ data: seasons }, { data: profiles }, { data: stores }, { data: seasonSales }] = await seasonDataPromise;
  const [activePopupAnnouncements, inactiveLoginPopup, documentIssuePopup, goalReminderPopup] = await Promise.all([
    activePopupAnnouncementsPromise,
    inactiveLoginPopupPromise,
    documentIssuePopupPromise,
    goalReminderPopupPromise
  ]);
  const popupAnnouncements = [
    ...(inactiveLoginPopup ? [inactiveLoginPopup] : []),
    ...(documentIssuePopup ? [documentIssuePopup] : []),
    ...(goalReminderPopup ? [goalReminderPopup] : []),
    ...activePopupAnnouncements
  ];

  const seasonRows = ((seasons as SeasonRecord[] | null) ?? []).filter((season) => season.is_active);
  const employeeProfiles =
    ((profiles as Array<{
      id: string;
      full_name: string;
      role: string;
      is_on_leave: boolean;
      store_id: string | null;
    }> | null) ?? []).filter((profile) => profile.role === "employee" && !profile.is_on_leave);
  const storeRows = (stores as Array<{ id: string; name: string }> | null) ?? [];
  const saleRows = (seasonSales as SeasonSaleRow[] | null) ?? [];

  const profileStoreMap = new Map(employeeProfiles.map((profile) => [profile.id, profile.store_id]));

  const leaderCards: HomeLeaderCard[] = seasonRows.map((season) => {
    const rangeStart = clampDate(monthStart, season.start_date, season.end_date);
    const rangeEnd = clampDate(monthEnd, season.start_date, season.end_date);

    if (rangeStart > rangeEnd) {
      return {
        seasonId: season.id,
        seasonName: season.name,
        winnerName: "Bu ay sezon aktif degil",
        score: 0,
        monthLabel,
        href: buildMonthHref(season.id, monthKey)
      };
    }

    const seasonMonthSales = saleRows.filter(
      (sale) => sale.season_id === season.id && sale.entry_date >= rangeStart && sale.entry_date <= rangeEnd
    );

    if (season.mode === "store") {
      const storeScores = storeRows.map((store) => {
        const score = seasonMonthSales.reduce((sum, sale) => {
          if (sale.target_store_id === store.id) {
            return sum + Number(sale.score ?? 0);
          }

          const profileStoreId = sale.target_profile_id ? profileStoreMap.get(sale.target_profile_id) ?? null : null;
          return profileStoreId === store.id ? sum + Number(sale.score ?? 0) : sum;
        }, 0);

        return {
          id: store.id,
          label: store.name,
          score
        };
      });

      const winner =
        storeScores.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "tr"))[0] ?? null;

      return {
        seasonId: season.id,
        seasonName: season.name,
        winnerName: winner && winner.score > 0 ? winner.label : "Henuz satis yok",
        score: winner?.score ?? 0,
        monthLabel,
        href: buildMonthHref(season.id, monthKey)
      };
    }

    const employeeScores = employeeProfiles.map((profile) => ({
      id: profile.id,
      label: profile.full_name,
      score: seasonMonthSales
        .filter((sale) => sale.target_profile_id === profile.id)
        .reduce((sum, sale) => sum + Number(sale.score ?? 0), 0)
    }));

    const winner =
      employeeScores.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "tr"))[0] ?? null;

    return {
      seasonId: season.id,
      seasonName: season.name,
      winnerName: winner && winner.score > 0 ? winner.label : "Henuz satis yok",
      score: winner?.score ?? 0,
      monthLabel,
      href: buildMonthHref(season.id, monthKey)
    };
  });

  return (
    <main>
      {popupAnnouncements.length > 0 ? <HomePopupAnnouncement announcements={popupAnnouncements} /> : null}

      {liveCampaignLeaderboard ? (
        <>
          <section className="hero home-leaders-hero">
            <div className="hero-copy">
              <h1 className="home-leaders-title">{liveCampaignLeaderboard.campaign.name}</h1>
              <p>
                Su anda canli olan kampanyanin anlik siralamasi asagida. Tum detay icin kampanyayi
                acabilirsiniz.
              </p>
            </div>
          </section>

          <section className="guide-card home-live-campaign-card">
            <div className="section-title compact-title">
              <div>
                <h2>Canli Kampanya Siralamasi</h2>
                <p>
                  {liveCampaignLeaderboard.campaign.mode === "employee" ? "Calisan bazli" : "Magaza bazli"}{" "}
                  | {liveCampaignLeaderboard.campaign.scoring === "points" ? "Puan" : "Adet"}
                </p>
              </div>
              <Link
                className="button-secondary"
                href={`/kampanyalar/${liveCampaignLeaderboard.campaign.id}?view=leaderboard`}
              >
                Kampanyayi Ac
              </Link>
            </div>

            <div className="leaderboard-list">
              {liveCampaignLeaderboard.leaderboard.slice(0, 5).map((row, index) => (
                <div key={row.id} className="leaderboard-row">
                  <div className={`leaderboard-rank ${row.score <= 0 ? "leaderboard-rank-empty" : ""}`}>
                    {index + 1}
                  </div>

                  <div>
                    <h4>
                      {row.label}
                      {index === 0 ? (
                        <span aria-label="Lider kupasi" className="leaderboard-cup" title="Lider kupasi">
                          Kupa
                        </span>
                      ) : null}
                    </h4>
                    <p>{row.badge ?? "Siralamada"}</p>
                  </div>

                  <strong>
                    {row.score.toLocaleString("tr-TR")}{" "}
                    {liveCampaignLeaderboard.campaign.scoring === "points" ? "puan" : "adet"}
                  </strong>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="hero home-leaders-hero">
            <div className="hero-copy">
              <h1 className="home-leaders-title">Ayın Yıldızları</h1>
            </div>
          </section>

          <section className="home-leader-stack">
            {leaderCards.length === 0 ? (
              <article className="home-leader-card">
                <div className="home-leader-head">
                  <strong>Sezon bulunamadi</strong>
                  <span className="home-leader-month">{monthLabel}</span>
                </div>
                <p className="page-subtitle">Admin panelinden aktif sezon tanimlandiginda burada liderler gorunecek.</p>
              </article>
            ) : (
              leaderCards.map((card) => (
                <Link key={card.seasonId} className="home-leader-card home-leader-card-link" href={card.href}>
                  <div className="home-leader-head">
                    <div>
                      <span className="home-leader-season">{card.seasonName}</span>
                      <strong>{card.monthLabel}</strong>
                    </div>
                  </div>

                  <div className="home-leader-body">
                    <div className="home-leader-trophy" aria-hidden="true">
                      <span className="home-leader-trophy-rank">1</span>
                      <span className="home-leader-trophy-icon">🏆</span>
                    </div>

                    <div className="home-leader-content">
                      <strong className="home-leader-name">{card.winnerName}</strong>
                      <span className="home-leader-score-label">Ayın lideri</span>
                    </div>

                    <strong className="home-leader-score">{card.score.toLocaleString("tr-TR")}</strong>
                  </div>
                </Link>
              ))
            )}
          </section>
        </>
      )}
    </main>
  );
}
