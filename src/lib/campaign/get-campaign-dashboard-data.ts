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

function buildLeaderboard(
  campaign: CampaignPageCampaign,
  approvedPeople: ApprovedProfileRecord[],
  saleRows: SalesEntryRecord[],
  storeRows: ActiveStoreRecord[]
): LeaderboardRow[] {
  if (campaign.mode === "employee") {
    return withBadges(
      approvedPeople
        .filter((person) => !person.is_on_leave && person.role === "employee")
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
    );
  }

  return withBadges(
    storeRows
      .map((store) => {
        const total = saleRows
          .filter((entry) => entry.campaign_id === campaign.id && entry.target_store_id === store.id)
          .reduce((sum, entry) => sum + Number(entry.weighted_score ?? 0), 0);

        return {
          id: store.id,
          label: store.name,
          score: total
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
  const admin = createAdminClient();
  const [{ data: profileData }, { data: campaigns }, { data: salesEntries }, { data: approvedProfiles }, { data: activeStores }] =
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
    profile.role === "manager"
      ? approvedPeople
          .filter((person) => person.store_id === profile.store_id && !person.is_on_leave)
          .map((person) => ({ id: person.id, full_name: person.full_name }))
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

  const activeLeaderboards = activeCampaigns.map((campaign) => {
    const leaderboard = buildLeaderboard(campaign, approvedPeople, saleRows, storeRows);
    return {
      campaign,
      leaderboard,
      personal: buildPersonalStats(campaign, leaderboard, profile.id, profile.store_id)
    };
  });

  const finishedLeaderboards = finishedCampaigns.map((campaign) => {
    const leaderboard = buildLeaderboard(campaign, approvedPeople, saleRows, storeRows);
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
