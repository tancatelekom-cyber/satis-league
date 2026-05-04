import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { LeaguePeriod, SeasonProductRecord, SeasonRecord } from "@/lib/types";

type LeagueRow = {
  id: string;
  label: string;
  storeName?: string;
  score: number;
};

type SaleRow = {
  season_id: string;
  product_id: string | null;
  target_profile_id: string | null;
  target_store_id: string | null;
  score: number;
  entry_date: string;
};

type LeaguePageProps = {
  searchParams?: Promise<{
    seasonId?: string;
    period?: LeaguePeriod;
    category?: string;
    year?: string;
    month?: string;
    quarter?: string;
  }>;
};

const periodOptions: Array<{ value: LeaguePeriod; label: string }> = [
  { value: "month", label: "Ay" },
  { value: "quarter", label: "Q" },
  { value: "year", label: "Yil" }
];

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

function buildYearOptions(startDate: string, endDate: string) {
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  const options: string[] = [];

  for (let year = startYear; year <= endYear; year += 1) {
    options.push(String(year));
  }

  return options;
}

function buildMonthOptionsForYear(startDate: string, endDate: string, year: string) {
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  const targetYear = Number(year);

  if (targetYear < startYear || targetYear > endYear) {
    return [] as Array<{ value: string; label: string }>;
  }

  const startMonth = targetYear === startYear ? Number(startDate.slice(5, 7)) : 1;
  const endMonth = targetYear === endYear ? Number(endDate.slice(5, 7)) : 12;
  const options: Array<{ value: string; label: string }> = [];

  for (let month = startMonth; month <= endMonth; month += 1) {
    options.push({
      value: `${year}-${String(month).padStart(2, "0")}`,
      label: MONTH_LABELS[month - 1]
    });
  }

  return options;
}

function buildQuarterOptionsForYear(startDate: string, endDate: string, year: string) {
  const monthOptions = buildMonthOptionsForYear(startDate, endDate, year);
  const quarterSet = new Set<string>();

  monthOptions.forEach((option) => {
    const monthIndex = Number(option.value.slice(5, 7));
    quarterSet.add(String(Math.floor((monthIndex - 1) / 3) + 1));
  });

  return Array.from(quarterSet)
    .sort()
    .map((value) => ({
      value,
      label: `Q${value}`
    }));
}

function getPeriodRange(
  period: LeaguePeriod,
  selectedYear: string,
  selectedMonth: string,
  selectedQuarter: string
) {
  const year = Number(selectedYear);

  if (period === "year") {
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31),
      label: `${year} Yili`
    };
  }

  if (period === "quarter") {
    const quarterIndex = Number(selectedQuarter);
    const quarterStartMonth = (quarterIndex - 1) * 3;
    return {
      start: new Date(year, quarterStartMonth, 1),
      end: new Date(year, quarterStartMonth + 3, 0),
      label: `${year} Q${quarterIndex}`
    };
  }

  const month = Number(selectedMonth.slice(5, 7)) - 1;

  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0),
    label: `${MONTH_LABELS[month]} ${year}`
  };
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampDate(value: string, min: string, max: string) {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

export default async function LeaguePage({ searchParams }: LeaguePageProps) {
  const params = searchParams ? await searchParams : undefined;
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const selectedSeasonId = String(params?.seasonId ?? "").trim();
  const selectedPeriod: LeaguePeriod =
    params?.period === "quarter" || params?.period === "year" ? params.period : "month";
  const selectedCategory = String(params?.category ?? "").trim();

  const { data: seasons } = await admin
    .from("seasons")
    .select(
      "id, name, description, start_date, end_date, mode, scoring, season_products, reward_title, reward_details, reward_first, reward_second, reward_third, is_active, created_at"
    )
    .order("start_date", { ascending: false });

  const seasonRows = (seasons as SeasonRecord[] | null) ?? [];
  const activeSeason =
    seasonRows.find((season) => season.id === selectedSeasonId) ??
    seasonRows.find((season) => season.is_active) ??
    seasonRows[0] ??
    null;

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

  const yearOptions = buildYearOptions(activeSeason.start_date, activeSeason.end_date);
  const currentYear = String(new Date().getFullYear());
  const effectiveYear = yearOptions.includes(String(params?.year ?? "").trim())
    ? String(params?.year)
    : yearOptions.includes(currentYear)
      ? currentYear
      : yearOptions[0];
  const monthOptions = buildMonthOptionsForYear(activeSeason.start_date, activeSeason.end_date, effectiveYear);
  const currentMonthValue = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const effectiveMonth = monthOptions.some((option) => option.value === String(params?.month ?? "").trim())
    ? String(params?.month)
    : monthOptions.some((option) => option.value === currentMonthValue)
      ? currentMonthValue
      : (monthOptions[0]?.value ?? `${effectiveYear}-01`);
  const quarterOptions = buildQuarterOptionsForYear(activeSeason.start_date, activeSeason.end_date, effectiveYear);
  const currentQuarter = String(Math.floor(new Date().getMonth() / 3) + 1);
  const effectiveQuarter = quarterOptions.some((option) => option.value === String(params?.quarter ?? "").trim())
    ? String(params?.quarter)
    : quarterOptions.some((option) => option.value === currentQuarter)
      ? currentQuarter
      : (quarterOptions[0]?.value ?? "1");

  const seasonIds = seasonRows.map((season) => season.id);
  const [{ data: profiles }, { data: stores }, { data: seasonProducts }, { data: seasonSales }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, role, approval, is_on_leave, store_id, store:stores(id, name)")
        .eq("approval", "approved"),
      admin.from("stores").select("id, name").eq("is_active", true),
      admin
        .from("season_products")
        .select("id, season_id, name, category_name, unit_label, base_points, sort_order")
        .eq("season_id", activeSeason.id)
        .order("sort_order"),
      seasonIds.length > 0
        ? admin
            .from("season_sales_entries")
            .select("season_id, product_id, target_profile_id, target_store_id, score, entry_date")
            .in("season_id", seasonIds)
        : Promise.resolve({ data: [] })
    ]);

  const profileRows =
    ((profiles as Array<{
      id: string;
      full_name: string;
      role: string;
      is_on_leave: boolean;
      store_id?: string | null;
      store: { id?: string; name: string } | null;
    }> | null) ?? []).filter((profile) => !profile.is_on_leave && profile.role === "employee");
  const storeRows = (stores as Array<{ id: string; name: string }> | null) ?? [];
  const productRows = (seasonProducts as SeasonProductRecord[] | null) ?? [];
  const saleRows = (seasonSales as SaleRow[] | null) ?? [];

  const categoryOptions = Array.from(
    new Set(productRows.map((product) => product.category_name?.trim() || "Genel").filter(Boolean))
  );
  const effectiveCategory = categoryOptions.includes(selectedCategory) ? selectedCategory : "";
  const productCategoryMap = new Map(
    productRows.map((product) => [product.id, product.category_name?.trim() || "Genel"])
  );

  const today = new Date();
  const rawRange = getPeriodRange(selectedPeriod, effectiveYear, effectiveMonth, effectiveQuarter);
  const clampedStart = clampDate(toDateString(rawRange.start), activeSeason.start_date, activeSeason.end_date);
  const clampedEnd = clampDate(toDateString(rawRange.end), activeSeason.start_date, activeSeason.end_date);
  const activeSeasonSales = saleRows.filter((sale) => sale.season_id === activeSeason.id);
  const filteredSeasonSales = activeSeasonSales.filter((sale) => {
    const saleDate = sale.entry_date;
    const categoryName = productCategoryMap.get(sale.product_id ?? "") ?? "Genel";

    if (saleDate < clampedStart || saleDate > clampedEnd) {
      return false;
    }

    if (effectiveCategory && categoryName !== effectiveCategory) {
      return false;
    }

    return true;
  });

  function buildEmployeeLeague(seasonId: string, sourceRows: SaleRow[]): LeagueRow[] {
    return profileRows
      .map((profile) => ({
        id: profile.id,
        label: profile.full_name,
        storeName: profile.store?.name ?? "Magaza yok",
        score: sourceRows
          .filter((entry) => entry.season_id === seasonId && entry.target_profile_id === profile.id)
          .reduce((sum, entry) => sum + Number(entry.score ?? 0), 0)
      }))
      .sort((a, b) => b.score - a.score);
  }

  function buildStoreLeague(seasonId: string, sourceRows: SaleRow[]): LeagueRow[] {
    const profileStoreMap = new Map(
      profileRows.map((profile) => [profile.id, profile.store_id ?? profile.store?.id ?? null])
    );

    return storeRows
      .map((store) => ({
        id: store.id,
        label: store.name,
        score: sourceRows
          .filter((entry) => {
            if (entry.season_id !== seasonId) {
              return false;
            }

            if (entry.target_store_id === store.id) {
              return true;
            }

            const profileStoreId = entry.target_profile_id
              ? profileStoreMap.get(entry.target_profile_id) ?? null
              : null;

            return profileStoreId === store.id;
          })
          .reduce((sum, entry) => sum + Number(entry.score ?? 0), 0)
      }))
      .sort((a, b) => b.score - a.score);
  }

  const activeEmployeeLeague = buildEmployeeLeague(activeSeason.id, filteredSeasonSales);
  const activeStoreLeague = buildStoreLeague(activeSeason.id, filteredSeasonSales);
  const primaryLeague =
    activeSeason.mode === "employee" ? activeEmployeeLeague : activeStoreLeague;
  const secondaryLeague =
    activeSeason.mode === "employee" ? activeStoreLeague : activeEmployeeLeague;
  const champion = primaryLeague[0] ?? null;
  const filteredTotalScore = filteredSeasonSales.reduce(
    (sum, row) => sum + Number(row.score ?? 0),
    0
  );
  const completedSeasons = seasonRows
    .filter((season) => season.id !== activeSeason.id && season.end_date < toDateString(today))
    .map((season) => {
      const seasonSourceRows = saleRows.filter((row) => row.season_id === season.id);
      const winnerLeague =
        season.mode === "employee"
          ? buildEmployeeLeague(season.id, seasonSourceRows)
          : buildStoreLeague(season.id, seasonSourceRows);

      return {
        ...season,
        champion: winnerLeague[0] ?? null
      };
    })
    .filter((season) => season.champion)
    .slice(0, 6);

  const buildLeagueHref = (overrides?: Partial<{
    seasonId: string;
    period: LeaguePeriod;
    category: string;
    year: string;
    month: string;
    quarter: string;
  }>) => {
    const params = new URLSearchParams();
    const seasonId = overrides?.seasonId ?? activeSeason.id;
    const period = overrides?.period ?? selectedPeriod;
    const category = overrides?.category ?? effectiveCategory;
    const year = overrides?.year ?? effectiveYear;
    const month = overrides?.month ?? effectiveMonth;
    const quarter = overrides?.quarter ?? effectiveQuarter;

    params.set("seasonId", seasonId);
    params.set("period", period);
    params.set("year", year);

    if (period === "month") {
      params.set("month", month);
    }

    if (period === "quarter") {
      params.set("quarter", quarter);
    }

    if (category) {
      params.set("category", category);
    }

    return `/lig?${params.toString()}`;
  };

  return (
    <main>
      <h1 className="page-title">Sezonluk Lig Tablosu</h1>
      <p className="page-subtitle">
        Secili sezon: {activeSeason.name} | {activeSeason.start_date} - {activeSeason.end_date}
      </p>

      <section className="guide-card game-brief-card">
        <h3>Sezon Secimi</h3>
        <div className="filter-chip-row">
          {seasonRows.map((season) => (
            <Link
              key={season.id}
              className={`filter-chip ${activeSeason.id === season.id ? "active" : ""}`}
              href={buildLeagueHref({ seasonId: season.id })}
            >
              {season.name}
              {season.is_active ? " (Aktif)" : ""}
            </Link>
          ))}
        </div>

        <h3>Yil Secimi</h3>
        <div className="filter-chip-row">
          {yearOptions.map((year) => {
            const yearMonthOptions = buildMonthOptionsForYear(activeSeason.start_date, activeSeason.end_date, year);
            const yearQuarterOptions = buildQuarterOptionsForYear(activeSeason.start_date, activeSeason.end_date, year);
            return (
              <Link
                key={year}
                className={`filter-chip ${effectiveYear === year ? "active" : ""}`}
                href={buildLeagueHref({
                  year,
                  month: yearMonthOptions[0]?.value ?? `${year}-01`,
                  quarter: yearQuarterOptions[0]?.value ?? "1"
                })}
              >
                {year}
              </Link>
            );
          })}
        </div>

        <h3>Donem Secimi</h3>
        <div className="filter-chip-row">
          {periodOptions.map((period) => (
            <Link
              key={period.value}
              className={`filter-chip ${selectedPeriod === period.value ? "active" : ""}`}
              href={buildLeagueHref({ period: period.value })}
            >
              {period.label}
            </Link>
          ))}
        </div>

        {selectedPeriod === "month" ? (
          <>
            <h3>Ay Secimi</h3>
            <div className="filter-chip-row">
              <Link
                className="filter-chip"
                href={buildLeagueHref({ period: "year" })}
              >
                Yilin Tumu
              </Link>
              {monthOptions.map((month) => (
                <Link
                  key={month.value}
                  className={`filter-chip ${effectiveMonth === month.value ? "active" : ""}`}
                  href={buildLeagueHref({ month: month.value })}
                >
                  {month.label}
                </Link>
              ))}
            </div>
          </>
        ) : null}

        {selectedPeriod === "quarter" ? (
          <>
            <h3>Q Secimi</h3>
            <div className="filter-chip-row">
              <Link
                className="filter-chip"
                href={buildLeagueHref({ period: "year" })}
              >
                Tum Q'lar
              </Link>
              {quarterOptions.map((quarter) => (
                <Link
                  key={quarter.value}
                  className={`filter-chip ${effectiveQuarter === quarter.value ? "active" : ""}`}
                  href={buildLeagueHref({ quarter: quarter.value })}
                >
                  {quarter.label}
                </Link>
              ))}
            </div>
          </>
        ) : null}

        <h3>Urun Kategorisi</h3>
        <div className="filter-chip-row">
          <Link
            className={`filter-chip ${effectiveCategory ? "" : "active"}`}
            href={buildLeagueHref({ category: "" })}
          >
            Tum Kategoriler
          </Link>
          {categoryOptions.map((category) => (
            <Link
              key={category}
              className={`filter-chip ${effectiveCategory === category ? "active" : ""}`}
              href={buildLeagueHref({ category })}
            >
              {category}
            </Link>
          ))}
        </div>
      </section>

      <section className="momentum-grid">
        <article className="guide-card">
          <h3>Gosterilen Donem</h3>
          <p>{rawRange.label}</p>
          <div className="mission-pills">
            <span className="mission-pill">
              {clampedStart} - {clampedEnd}
            </span>
            <span className="mission-pill">
              {effectiveCategory || "Tum kategoriler"}
            </span>
          </div>
        </article>

        <article className="guide-card">
          <h3>Donem Ozeti</h3>
          <div className="profile-summary">
            <div className="summary-card">
              <span>Kayit</span>
              <strong>{filteredSeasonSales.length}</strong>
            </div>
            <div className="summary-card">
              <span>Toplam Puan</span>
              <strong>{filteredTotalScore.toFixed(0)}</strong>
            </div>
            <div className="summary-card">
              <span>Lider</span>
              <strong>{champion?.label ?? "-"}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="campaign-layout">
        <article className="leaderboard-card">
          <h3>
            {periodOptions.find((option) => option.value === selectedPeriod)?.label} Birincisi
          </h3>
          {champion ? (
            <div className="profile-summary">
              <div className="summary-row">
                <span>Kazanan</span>
                <strong>{champion.label}</strong>
              </div>
              <div className="summary-row">
                <span>Toplam</span>
                <strong>{champion.score.toFixed(0)}</strong>
              </div>
              <div className="summary-row">
                <span>Yaris Turu</span>
                <strong>{activeSeason.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"}</strong>
              </div>
              <div className="summary-row">
                <span>Kategori</span>
                <strong>{effectiveCategory || "Tum kategoriler"}</strong>
              </div>
            </div>
          ) : (
            <p>Bu donemde henuz sezon girisi yok.</p>
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
          <h3>{activeSeason.mode === "employee" ? "Calisan Siralamasi" : "Magaza Siralamasi"}</h3>
          <div className="leaderboard-list">
            {primaryLeague.map((row, index) => (
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
                  <p className="subtle">{row.storeName ?? rawRange.label}</p>
                </div>
                <div className="score">
                  <strong>{row.score.toFixed(0)}</strong>
                  <span className="subtle">donem puani</span>
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
                  <p className="subtle">
                    {row.storeName ??
                      (activeSeason.mode === "employee"
                        ? "Calisan donem girislerinden gelen toplam"
                        : "Magaza sezonuna katki ozeti")}
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
        <h3>Sezon Urun Kategorileri</h3>
        <div className="approval-list">
          {productRows.map((product) => (
            <div key={product.id} className="approval-row">
              <div>
                <h4>{product.name}</h4>
                <p className="subtle">{product.category_name}</p>
              </div>
              <div className="score">
                <strong>{Number(product.base_points).toFixed(0)}</strong>
                <span className="subtle">{product.unit_label}</span>
              </div>
            </div>
          ))}
        </div>
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
