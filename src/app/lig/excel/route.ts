import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCsv } from "@/lib/export/csv";
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

  return Array.from(quarterSet).sort();
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

export async function GET(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Giris gerekli." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const selectedSeasonId = String(searchParams.get("seasonId") ?? "").trim();
  const selectedPeriod = (searchParams.get("period") as LeaguePeriod | null) ?? "month";
  const selectedCategory = String(searchParams.get("category") ?? "").trim();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, approval")
    .eq("id", user.id)
    .single();

  if (!profile || profile.approval !== "approved") {
    return NextResponse.json({ error: "Yetkisiz erisim." }, { status: 403 });
  }

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
    return NextResponse.json({ error: "Sezon bulunamadi." }, { status: 404 });
  }

  const yearOptions = buildYearOptions(activeSeason.start_date, activeSeason.end_date);
  const currentYear = String(new Date().getFullYear());
  const effectiveYear = yearOptions.includes(String(searchParams.get("year") ?? "").trim())
    ? String(searchParams.get("year"))
    : yearOptions.includes(currentYear)
      ? currentYear
      : yearOptions[0];
  const monthOptions = buildMonthOptionsForYear(activeSeason.start_date, activeSeason.end_date, effectiveYear);
  const currentMonthValue = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const effectiveMonth = monthOptions.some((option) => option.value === String(searchParams.get("month") ?? "").trim())
    ? String(searchParams.get("month"))
    : monthOptions.some((option) => option.value === currentMonthValue)
      ? currentMonthValue
      : (monthOptions[0]?.value ?? `${effectiveYear}-01`);
  const quarterOptions = buildQuarterOptionsForYear(activeSeason.start_date, activeSeason.end_date, effectiveYear);
  const currentQuarter = String(Math.floor(new Date().getMonth() / 3) + 1);
  const effectiveQuarter = quarterOptions.includes(String(searchParams.get("quarter") ?? "").trim())
    ? String(searchParams.get("quarter"))
    : quarterOptions.includes(currentQuarter)
      ? currentQuarter
      : (quarterOptions[0] ?? "1");

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
    }> | null) ?? []).filter((entry) => !entry.is_on_leave && entry.role === "employee");
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

  const buildEmployeeLeague = (seasonId: string, sourceRows: SaleRow[]): LeagueRow[] =>
    profileRows
      .map((profileRow) => ({
        id: profileRow.id,
        label: profileRow.full_name,
        storeName: profileRow.store?.name ?? "Magaza yok",
        score: sourceRows
          .filter((entry) => entry.season_id === seasonId && entry.target_profile_id === profileRow.id)
          .reduce((sum, entry) => sum + Number(entry.score ?? 0), 0)
      }))
      .sort((a, b) => b.score - a.score);

  const buildStoreLeague = (seasonId: string, sourceRows: SaleRow[]): LeagueRow[] => {
    const profileStoreMap = new Map(
      profileRows.map((profileRow) => [profileRow.id, profileRow.store_id ?? profileRow.store?.id ?? null])
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
  };

  const primaryLeague =
    activeSeason.mode === "employee"
      ? buildEmployeeLeague(activeSeason.id, filteredSeasonSales)
      : buildStoreLeague(activeSeason.id, filteredSeasonSales);
  const secondaryLeague =
    activeSeason.mode === "employee"
      ? buildStoreLeague(activeSeason.id, filteredSeasonSales)
      : buildEmployeeLeague(activeSeason.id, filteredSeasonSales);

  const rows = [
    ["Sezon", activeSeason.name],
    ["Donem", rawRange.label],
    ["Baslangic", clampedStart],
    ["Bitis", clampedEnd],
    ["Kategori", effectiveCategory || "Tum kategoriler"],
    ["Yaris Turu", activeSeason.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli"],
    [],
    ["Ana Siralama"],
    ["Sira", "Ad Soyad / Magaza", "Magaza", "Skor"],
    ...primaryLeague.map((row, index) => [
      index + 1,
      row.label,
      row.storeName ?? "-",
      Number(row.score.toFixed(0))
    ]),
    [],
    ["Ikinci Siralama"],
    ["Sira", "Ad Soyad / Magaza", "Magaza", "Skor"],
    ...secondaryLeague.map((row, index) => [
      index + 1,
      row.label,
      row.storeName ?? "-",
      Number(row.score.toFixed(0))
    ])
  ];

  const csv = buildCsv(rows);
  const fileName = `${activeSeason.name.toLowerCase().replace(/\s+/g, "-")}-lig.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}
