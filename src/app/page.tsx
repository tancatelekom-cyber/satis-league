import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SeasonRecord } from "@/lib/types";

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
  seasonMode: "employee" | "store";
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

export default async function HomePage() {
  const admin = createAdminClient();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = `${MONTH_LABELS[now.getMonth()]} ${now.getFullYear()}`;
  const monthStart = toDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = toDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const [{ data: seasons }, { data: profiles }, { data: stores }, { data: seasonSales }] = await Promise.all([
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

  const profileMap = new Map(employeeProfiles.map((profile) => [profile.id, profile.full_name]));
  const storeMap = new Map(storeRows.map((store) => [store.id, store.name]));
  const profileStoreMap = new Map(employeeProfiles.map((profile) => [profile.id, profile.store_id]));

  const leaderCards: HomeLeaderCard[] = seasonRows.map((season) => {
    const rangeStart = clampDate(monthStart, season.start_date, season.end_date);
    const rangeEnd = clampDate(monthEnd, season.start_date, season.end_date);

    if (rangeStart > rangeEnd) {
      return {
        seasonId: season.id,
        seasonName: season.name,
        seasonMode: season.mode,
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
        seasonMode: season.mode,
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
      seasonMode: season.mode,
      winnerName: winner && winner.score > 0 ? winner.label : "Henuz satis yok",
      score: winner?.score ?? 0,
      monthLabel,
      href: buildMonthHref(season.id, monthKey)
    };
  });

  return (
    <main>
      <section className="hero home-leaders-hero">
        <div className="hero-copy">
          <h1>TANCA+</h1>
          <p className="page-subtitle">Bu ayin sezon liderleri</p>
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
                <span className={`home-leader-mode ${card.seasonMode === "store" ? "home-leader-mode-store" : ""}`}>
                  {card.seasonMode === "store" ? "Magaza" : "Calisan"}
                </span>
              </div>

              <div className="home-leader-body">
                <div className="home-leader-trophy" aria-hidden="true">
                  <span className="home-leader-trophy-rank">1</span>
                  <span className="home-leader-trophy-icon">🏆</span>
                </div>

                <div className="home-leader-content">
                  <strong className="home-leader-name">{card.winnerName}</strong>
                  <span className="home-leader-score">{card.score.toLocaleString("tr-TR")} toplam skor</span>
                </div>

                <span className="home-leader-open">Sezonu Ac</span>
              </div>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
