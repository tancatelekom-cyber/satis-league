import { createAdminClient } from "@/lib/supabase/admin";

export const MONTHLY_CAMPAIGN_BUCKET = "monthly-campaigns";

export type MonthlyCampaignSlide = {
  id: string;
  title: string;
  imagePath: string;
  imageUrl: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
};

type MonthlyCampaignSlideRow = {
  id: string;
  title: string;
  image_path: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

function mapSlide(row: MonthlyCampaignSlideRow): MonthlyCampaignSlide {
  const admin = createAdminClient();
  const { data } = admin.storage.from(MONTHLY_CAMPAIGN_BUCKET).getPublicUrl(row.image_path);

  return {
    id: row.id,
    title: row.title,
    imagePath: row.image_path,
    imageUrl: data.publicUrl,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at
  };
}

export async function getMonthlyCampaignSlides(options?: { includeInactive?: boolean }) {
  const admin = createAdminClient();
  let query = admin
    .from("monthly_campaign_slides")
    .select("id, title, image_path, is_active, sort_order, created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Aylik kampanya gorselleri okunamadi: ${error.message}`);
  }

  return ((data as MonthlyCampaignSlideRow[] | null) ?? []).map(mapSlide);
}
