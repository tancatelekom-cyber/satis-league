import { createAdminClient } from "@/lib/supabase/admin";
import {
  AdminCampaign,
  AdminPendingProfile,
  AdminSeason,
  AdminStore,
  CampaignProductRecord,
  CampaignStoreMultiplierRecord,
  SeasonProductRecord,
  SeasonStoreMultiplierRecord
} from "@/lib/types";

type AdminDashboardParams = {
  entryMonth?: string;
  saleSearch?: string;
  saleDateFrom?: string;
  saleDateTo?: string;
  saleMonth?: string;
  saleCategory?: string;
};

export type ActiveSeasonSaleRecord = {
  id: string;
  season_id: string;
  product_id: string | null;
  product_name: string;
  entry_date: string;
  quantity: number;
  raw_score: number;
  score: number;
  note: string | null;
  created_at: string;
  target_profile_id: string | null;
  target_store_id: string | null;
  targetProfile: { full_name: string } | null;
  targetStore: { name: string } | null;
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

function buildSeasonMonthOptions(startDate: string, endDate: string) {
  const [startYear, startMonth] = startDate.split("-").map(Number);
  const [endYear, endMonth] = endDate.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const finish = new Date(Date.UTC(endYear, endMonth - 1, 1));
  const options: Array<{ value: string; label: string }> = [];

  while (cursor <= finish) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const value = `${year}-${String(month).padStart(2, "0")}`;
    options.push({
      value,
      label: `${MONTH_LABELS[month - 1]} ${year}`
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return options;
}

export async function getAdminDashboardData(params: AdminDashboardParams = {}) {
  const entryMonth = String(params.entryMonth ?? "").trim() || new Date().toISOString().slice(0, 7);
  const saleSearch = String(params.saleSearch ?? "").trim().toLocaleLowerCase("tr-TR");
  const saleDateFrom = String(params.saleDateFrom ?? "").trim();
  const saleDateTo = String(params.saleDateTo ?? "").trim();
  const saleMonth = String(params.saleMonth ?? "").trim();
  const saleCategory = String(params.saleCategory ?? "").trim();
  const supabase = createAdminClient();

  const [{ data: stores }, { data: pendingProfiles }, { data: campaigns }, { data: seasons }] =
    await Promise.all([
      supabase.from("stores").select("id, name, city, base_multiplier, is_active").order("name"),
      supabase
        .from("profiles")
        .select(
          `
            id,
            full_name,
            email,
            phone,
            role,
            approval,
            created_at,
            store:stores(name)
          `
        )
        .eq("approval", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("campaigns")
        .select(
          "id, name, description, mode, scoring, start_date, end_date, start_at, end_at, reward_title, reward_details, reward_first, reward_second, reward_third, is_active, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("seasons")
        .select(
          "id, name, description, start_date, end_date, mode, scoring, season_products, reward_title, reward_details, reward_first, reward_second, reward_third, is_active, created_at"
        )
        .order("start_date", { ascending: false })
    ]);

  const storeRows = (stores as AdminStore[] | null) ?? [];
  const approvalRows = (pendingProfiles as AdminPendingProfile[] | null) ?? [];
  const campaignRows = (campaigns as AdminCampaign[] | null) ?? [];
  const seasonRows = (seasons as AdminSeason[] | null) ?? [];
  const campaignIds = campaignRows.map((campaign) => campaign.id);
  const seasonIds = seasonRows.map((season) => season.id);

  const [{ data: campaignProducts }, { data: campaignStoreMultipliers }] = campaignIds.length
    ? await Promise.all([
        supabase
          .from("campaign_products")
          .select("id, campaign_id, name, unit_label, base_points, sort_order")
          .in("campaign_id", campaignIds)
          .order("sort_order"),
        supabase
          .from("campaign_store_multipliers")
          .select(
            `
              id,
              campaign_id,
              store_id,
              multiplier,
              store:stores(name)
            `
          )
          .in("campaign_id", campaignIds)
      ])
    : [{ data: [] as CampaignProductRecord[] }, { data: [] as CampaignStoreMultiplierRecord[] }];

  const [{ data: seasonProducts }, { data: seasonStoreMultipliers }] = seasonIds.length
    ? await Promise.all([
        supabase
          .from("season_products")
          .select("id, season_id, name, category_name, unit_label, base_points, sort_order")
          .in("season_id", seasonIds)
          .order("sort_order"),
        supabase
          .from("season_store_multipliers")
          .select(
            `
              id,
              season_id,
              store_id,
              multiplier,
              store:stores(name)
            `
          )
          .in("season_id", seasonIds)
      ])
    : [{ data: [] as SeasonProductRecord[] }, { data: [] as SeasonStoreMultiplierRecord[] }];

  const approvedProfilesForSeason =
    ((await supabase
      .from("profiles")
      .select("id, full_name, approval, store_id, role, is_on_leave")
      .eq("approval", "approved")).data as Array<{
      id: string;
      full_name: string;
      approval: string;
      store_id: string | null;
      role: string;
      is_on_leave: boolean;
    }> | null) ?? [];
  const activeEmployeeTargets = approvedProfilesForSeason.filter(
    (profile) => profile.role === "employee" && !profile.is_on_leave
  );

  const activeSeason = seasonRows.find((season) => season.is_active) ?? null;
  const activeSeasonProducts = activeSeason
    ? ((seasonProducts as SeasonProductRecord[] | null) ?? []).filter(
        (product) => product.season_id === activeSeason.id
      )
    : [];
  const activeSeasonCategories = Array.from(
    new Set(
      activeSeasonProducts
        .map((product) => product.category_name?.trim() || "Genel")
        .filter(Boolean)
    )
  );
  const productCategoryMap = new Map(
    activeSeasonProducts.map((product) => [product.id, product.category_name?.trim() || "Genel"])
  );
  const seasonMonthOptions =
    activeSeason && activeSeason.start_date && activeSeason.end_date
      ? buildSeasonMonthOptions(activeSeason.start_date, activeSeason.end_date)
      : [];

  const activeSeasonSales =
    activeSeason
      ? (((await supabase
          .from("season_sales_entries")
          .select(
            `
              id,
              season_id,
              product_id,
              product_name,
              entry_date,
              quantity,
              raw_score,
              score,
              note,
              created_at,
              target_profile_id,
              target_store_id,
              targetProfile:profiles!season_sales_entries_target_profile_id_fkey(full_name),
              targetStore:stores!season_sales_entries_target_store_id_fkey(name)
            `
          )
          .eq("season_id", activeSeason.id)
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(100)).data as ActiveSeasonSaleRecord[] | null) ?? [])
      : [];

  const filteredActiveSeasonSales = activeSeasonSales.filter((sale) => {
    const searchableText = [
      sale.product_name,
      productCategoryMap.get(sale.product_id ?? "") ?? "Genel",
      sale.note ?? "",
      sale.targetProfile?.full_name ?? "",
      sale.targetStore?.name ?? ""
    ]
      .join(" ")
      .toLocaleLowerCase("tr-TR");
    const saleDay = sale.entry_date || sale.created_at.slice(0, 10);

    if (saleSearch && !searchableText.includes(saleSearch)) {
      return false;
    }

    if (saleDateFrom && saleDay < saleDateFrom) {
      return false;
    }

    if (saleDateTo && saleDay > saleDateTo) {
      return false;
    }

    if (saleMonth && !saleDay.startsWith(saleMonth)) {
      return false;
    }

    if (saleCategory) {
      const categoryName = productCategoryMap.get(sale.product_id ?? "") ?? "Genel";
      if (categoryName !== saleCategory) {
        return false;
      }
    }

    return true;
  });

  const filteredSeasonSummary = filteredActiveSeasonSales.reduce(
    (acc, sale) => ({
      count: acc.count + 1,
      quantity: acc.quantity + Number(sale.quantity ?? 0),
      rawScore: acc.rawScore + Number(sale.raw_score ?? 0),
      score: acc.score + Number(sale.score ?? 0)
    }),
    { count: 0, quantity: 0, rawScore: 0, score: 0 }
  );
  const activeMonthSales = activeSeasonSales.filter((sale) => sale.entry_date.startsWith(entryMonth));
  const monthQuantityMap = new Map<string, number>();

  activeMonthSales.forEach((sale) => {
    const targetId = sale.target_profile_id ?? sale.target_store_id;
    if (!targetId || !sale.product_id) {
      return;
    }

    const key = `${targetId}__${sale.product_id}`;
    monthQuantityMap.set(key, Number(monthQuantityMap.get(key) ?? 0) + Number(sale.quantity ?? 0));
  });

  return {
    storeRows,
    approvalRows,
    campaignRows,
    seasonRows,
    productRows: (campaignProducts as CampaignProductRecord[] | null) ?? [],
    multiplierRows: (campaignStoreMultipliers as CampaignStoreMultiplierRecord[] | null) ?? [],
    seasonProductRows: (seasonProducts as SeasonProductRecord[] | null) ?? [],
    seasonMultiplierRows: (seasonStoreMultipliers as SeasonStoreMultiplierRecord[] | null) ?? [],
    approvedProfilesForSeason: activeEmployeeTargets,
    seasonEntryTargets:
      activeSeason?.mode === "employee"
        ? activeEmployeeTargets.map((profile) => ({
            id: profile.id,
            label: profile.full_name,
            secondary: storeRows.find((store) => store.id === profile.store_id)?.name ?? "Magaza yok"
          }))
        : storeRows
            .filter((store) => store.is_active)
            .map((store) => ({ id: store.id, label: store.name, secondary: store.city ?? "Magaza" })),
    activeSeason,
    activeSeasonProducts,
    activeSeasonCategories,
    seasonMonthOptions,
    activeSeasonSales,
    activeMonthSales,
    monthQuantityMap,
    entryMonth,
    filteredActiveSeasonSales,
    filteredSeasonSummary,
    saleSearch,
    saleDateFrom,
    saleDateTo,
    saleMonth,
    saleCategory
  };
}
