export type UserRole = "employee" | "manager" | "management" | "admin";
export type CampaignMode = "employee" | "store";
export type ScoringType = "points" | "quantity";
export type LeaguePeriod = "month" | "quarter" | "year";
export type TariffCategoryMode = "gb" | "minutes" | "name";
export type TariffPreset =
  | "all"
  | "new-member"
  | "emekli"
  | "emek"
  | "platinum"
  | "gnc"
  | "general-postpaid";

export type CampaignProduct = {
  id: string;
  name: string;
  unitLabel: string;
  basePoints: number;
  enteredAmount: number;
};

export type LeaderboardRow = {
  id: string;
  label: string;
  score: number;
  badge?: string;
  streak?: number;
};

export type Campaign = {
  id: string;
  name: string;
  description: string;
  mode: CampaignMode;
  scoring: ScoringType;
  startDate: string;
  endDate: string;
  countdown: string;
  products: CampaignProduct[];
  leaderboard: LeaderboardRow[];
};

export type PendingApproval = {
  id: string;
  fullName: string;
  role: UserRole;
  storeName: string;
  phone: string;
  requestedAt: string;
};

export type StoreOption = {
  id: string;
  name: string;
  city: string | null;
};

export type ProfileSummary = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  approval: "pending" | "approved" | "rejected";
  is_on_leave: boolean;
  store: {
    name: string;
  } | null;
};

export type AdminStore = {
  id: string;
  name: string;
  city: string | null;
  base_multiplier: number;
  is_active: boolean;
};

export type AdminPendingProfile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  approval: "pending" | "approved" | "rejected";
  created_at: string;
  store: {
    name: string;
  } | null;
};

export type AdminManagedProfile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  approval: "pending" | "approved" | "rejected";
  created_at: string;
  is_on_leave: boolean;
  store: {
    name: string;
  } | null;
};

export type AdminSeason = {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  mode: CampaignMode;
  scoring: ScoringType;
  season_products: string[];
  reward_title: string | null;
  reward_details: string | null;
  reward_first: string | null;
  reward_second: string | null;
  reward_third: string | null;
  is_active: boolean;
  created_at: string;
};

export type SeasonProductRecord = {
  id: string;
  season_id: string;
  name: string;
  category_name: string;
  unit_label: string;
  base_points: number;
  sort_order: number;
};

export type SeasonStoreMultiplierRecord = {
  id: string;
  season_id: string;
  store_id: string;
  multiplier: number;
  store: {
    name: string;
  } | null;
};

export type AdminCampaign = {
  id: string;
  name: string;
  description: string | null;
  mode: CampaignMode;
  scoring: ScoringType;
  start_date: string;
  end_date: string;
  start_at: string;
  end_at: string;
  reward_title: string | null;
  reward_details: string | null;
  reward_threshold_value: number | null;
  reward_first: string | null;
  reward_second: string | null;
  reward_third: string | null;
  is_active: boolean;
  created_at: string;
};

export type CampaignProductRecord = {
  id: string;
  campaign_id: string;
  name: string;
  unit_label: string;
  base_points: number;
  sort_order: number;
};

export type CampaignStoreMultiplierRecord = {
  id: string;
  campaign_id: string;
  store_id: string;
  multiplier: number;
  store: {
    name: string;
  } | null;
};

export type CampaignEntryPermissionRecord = {
  id: string;
  campaign_id: string;
  profile_id: string;
  profile: {
    full_name: string;
    role: UserRole;
  } | null;
};

export type AdminCampaignSaleRecord = {
  id: string;
  campaign_id: string;
  product_id: string;
  actor_profile_id: string;
  target_profile_id: string | null;
  target_store_id: string | null;
  quantity: number;
  raw_score: number;
  weighted_score: number;
  created_at: string;
  product: {
    name: string;
    unit_label: string;
    base_points: number;
  } | null;
  actorProfile: {
    full_name: string;
  } | null;
  targetProfile: {
    full_name: string;
  } | null;
  targetStore: {
    name: string;
  } | null;
};

export type CampaignPageCampaign = {
  id: string;
  name: string;
  description: string | null;
  mode: CampaignMode;
  scoring: ScoringType;
  start_date: string;
  end_date: string;
  start_at: string;
  end_at: string;
  reward_title: string | null;
  reward_details: string | null;
  reward_threshold_value: number | null;
  reward_first: string | null;
  reward_second: string | null;
  reward_third: string | null;
  is_active: boolean;
  products: CampaignProductRecord[];
  can_submit?: boolean;
};

export type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  level: string;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};

export type SeasonRecord = {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  mode: CampaignMode;
  scoring: ScoringType;
  season_products: string[];
  reward_title: string | null;
  reward_details: string | null;
  reward_first: string | null;
  reward_second: string | null;
  reward_third: string | null;
  is_active: boolean;
  created_at: string;
};

export type SeasonSalesEntryRecord = {
  id: string;
  season_id: string;
  product_id: string | null;
  product_name: string;
  entry_date: string;
  target_profile_id: string | null;
  target_store_id: string | null;
  quantity: number;
  raw_score: number;
  score: number;
  note: string | null;
  created_at: string;
};

export type TariffRecord = {
  id: string;
  provider: string;
  source_url: string | null;
  name: string;
  category_name: string;
  line_type: string;
  data_gb: number;
  minutes: number;
  sms: number;
  price: number;
  details: string | null;
  is_online_only: boolean;
  is_digital_only: boolean;
  is_active: boolean;
  scraped_at: string | null;
  created_at: string;
  updated_at: string;
};
