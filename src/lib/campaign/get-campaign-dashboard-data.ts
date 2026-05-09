import { unstable_noStore as noStore } from "next/cache";
import { isPlannedCampaign, isRecentFinishedCampaign, isSalesWindowOpen } from "@/lib/campaign-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { CampaignPageCampaign, CampaignProductRecord, LeaderboardRow, ProfileSummary } from "@/lib/types";

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

export type CampaignPersonalStats = {
  currentScore: number;
  rank: number | null;
  gap: number;
  nextGap: number;
  leaderLabel: string;
  nextLabel: string;
};

export type ActiveCampaignLeaderboard = {
  campaign: CampaignPageCampaign;
  leaderboard: LeaderboardRow[];
  personal: CampaignPersonalStats;
};

export type UserCampaignDashboardData = {
  profile: ProfileSummary & { store_id?: string | null };
  teamProfiles: { id: string; full_name: string }[];
  plannedCampaigns: CampaignPageCampaign[];
  activeCampaigns: CampaignPageCampaign[];
  finishedCampaigns: CampaignPageCampaign[];
  activeLeaderboards: ActiveCampaignLeaderboard[];
  finishedLeaderboards: ActiveCampaignLeaderboard[];
};

function withBadges(rows: LeaderboardRow[]) {
  return rows.map((row, index) => ({
    ...row,
    badge: index === 0 ? "Lider" : index === 1 ? "Takipte" : index === 2 ? "Yukseliste" : "Atakta"
  }));
}

function buildScoreMaps(saleRows: SalesEntryRecord[]) {
  const employeeScores = new Map<string, Map<string, number>>();
  const storeScores = new Map<string, Map<string, number>>();

  saleRows.forEach((entry) => {
    const score = Number(entry.weighted_score ?? 0);

    if (entry.target_profile_id) {
      const byCampaign = employeeScores.get(entry.campaign_id) ?? new Map<string, number>();
      byCampaign.set(entry.target_profile_id, (byCampaign.get(entry.target_profile_id) ?? 0) + score);
      employeeScores.set(entry.campaign_id, byCampaign);
    }

    if (entry.target_store_id) {
      const byCampaign = storeScores.get(entry.campaign_id) ?? new Map<string, number>();
      byCampaign.set(entry.target_store_id, (byCampaign.get(entry.target_store_id) ?? 0) + score);
      storeScores.set(entry.campaign_id, byCampaign);
    }
  });

  return { employeeScores, storeScores };
}

function buildLeaderboard(
  campaign: CampaignPageCampaign,
  approvedPeople: ApprovedProfileRecord[],
  storeRows: ActiveStoreRecord[],
  scoreMaps: ReturnType<typeof buildScoreMaps>
): LeaderboardRow[] {
  if (campaign.mode === "employee") {
    const campaignScores = scoreMaps.employeeScores.get(campaign.id) ?? new Map<string, number>();

    return withBadges(
      approvedPeople
        .filter((person) => !person.is_on_leave && person.role === "employee")
        .map((person) => {
          return {
            id: person.id,
            label: person.full_name,
            score: campaignScores.get(person.id) ?? 0
          };
        })
        .sort((a, b) => b.score - a.score)
    );
  }

  const campaignScores = scoreMaps.storeScores.get(campaign.id) ?? new Map<string, number>();

  return withBadges(
    storeRows
      .map((store) => {
        return {
          id: store.id,
          label: store.name,
          score: campaignScores.get(store.id) ?? 0
        };
      })
      .sort((a, b) => b.score - a.score)
  );
}

function buildPersonalStats(
  campaign: CampaignPageCampaign,
  leaderboard: LeaderboardRow[],
  profileId: string,
  storeId: string | null | undefined
) {
  const participantId = campaign.mode === "employee" ? profileId : storeId;
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

export async function getCampaignDashboardData(userId: string): Promise<UserCampaignDashboardData | null> {
  noStore();
  const admin = createAdminClient();
  const [{ data: profileData }, { data: campaigns }, { data: approvedProfiles }, { data: activeStores }] =
    await Promise.all([
      admin
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
        .eq("id", userId)
        .single(),
      admin
        .from("campaigns")
        .select("id, name, description, mode, scoring, start_date, end_date, start_at, end_at, reward_title, reward_details, reward_threshold_value, reward_first, reward_second, reward_third, is_active")
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      admin
        .from("profiles")
        .select("id, full_name, role, store_id, approval, is_on_leave")
        .eq("approval", "approved"),
      admin.from("stores").select("id, name, is_active").eq("is_active", true)
    ]);

  const profile = (profileData as (ProfileSummary & { store_id?: string | null }) | null) ?? null;
  if (!profile) {
    return null;
  }

  const allCampaignRows = ((campaigns as CampaignPageCampaign[] | null) ?? []).filter(
    (item) =>
      item.is_active &&
      (isPlannedCampaign(item.start_at) ||
        isSalesWindowOpen(item.start_at, item.end_at) ||
        isRecentFinishedCampaign(item.end_at))
  );

  const campaignIds = allCampaignRows.map((campaign) => campaign.id);
  const [{ data: products }, { data: salesEntries }, { data: entryPermissions }] = campaignIds.length
    ? await Promise.all([
        admin
          .from("campaign_products")
          .select("id, campaign_id, name, unit_label, base_points, sort_order")
          .in("campaign_id", campaignIds)
          .order("sort_order"),
        admin
          .from("sales_entries")
          .select("campaign_id, target_profile_id, target_store_id, weighted_score, quantity, created_at")
          .in("campaign_id", campaignIds),
        admin
          .from("campaign_entry_permissions")
          .select("campaign_id, profile_id")
          .in("campaign_id", campaignIds)
      ])
    : [
        { data: [] as CampaignProductRecord[] },
        { data: [] as SalesEntryRecord[] },
        { data: [] as Array<{ campaign_id: string; profile_id: string }> }
      ];

  const productRows = (products as CampaignProductRecord[] | null) ?? [];
  const approvedPeople = (approvedProfiles as ApprovedProfileRecord[] | null) ?? [];
  const saleRows = (salesEntries as SalesEntryRecord[] | null) ?? [];
  const permissionRows = ((entryPermissions as Array<{ campaign_id: string; profile_id: string }> | null) ?? []);
  const storeRows = (activeStores as ActiveStoreRecord[] | null) ?? [];
  const scoreMaps = buildScoreMaps(saleRows);
  const permissionMap = new Map<string, Set<string>>();

  permissionRows.forEach((row) => {
    const existing = permissionMap.get(row.campaign_id) ?? new Set<string>();
    existing.add(row.profile_id);
    permissionMap.set(row.campaign_id, existing);
  });
  const teamProfiles =
    profile.role === "manager"
      ? approvedPeople
          .filter(
            (person) =>
              person.store_id === profile.store_id &&
              !person.is_on_leave &&
              person.role === "employee"
          )
          .map((person) => ({ id: person.id, full_name: person.full_name }))
      : [];

  const campaignCards = allCampaignRows.map((campaign) => ({
    ...campaign,
    products: productRows.filter((product) => product.campaign_id === campaign.id),
    can_submit:
      (permissionMap.get(campaign.id)?.size ?? 0) === 0 ||
      permissionMap.get(campaign.id)?.has(profile.id) === true
  }));

  const plannedCampaigns = campaignCards.filter((campaign) => isPlannedCampaign(campaign.start_at));
  const activeCampaigns = campaignCards.filter((campaign) =>
    isSalesWindowOpen(campaign.start_at, campaign.end_at)
  );
  const finishedCampaigns = campaignCards.filter((campaign) =>
    isRecentFinishedCampaign(campaign.end_at)
  );

  const activeLeaderboards = activeCampaigns.map((campaign) => {
    const leaderboard = buildLeaderboard(campaign, approvedPeople, storeRows, scoreMaps);
    return {
      campaign,
      leaderboard,
      personal: buildPersonalStats(campaign, leaderboard, profile.id, profile.store_id)
    };
  });

  const finishedLeaderboards = finishedCampaigns.map((campaign) => {
    const leaderboard = buildLeaderboard(campaign, approvedPeople, storeRows, scoreMaps);
    return {
      campaign,
      leaderboard,
      personal: buildPersonalStats(campaign, leaderboard, profile.id, profile.store_id)
    };
  });

  return {
    profile,
    teamProfiles,
    plannedCampaigns,
    activeCampaigns,
    finishedCampaigns,
    activeLeaderboards,
    finishedLeaderboards
  };
}
