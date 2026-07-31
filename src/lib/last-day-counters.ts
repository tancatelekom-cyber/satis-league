import { createAdminClient } from "@/lib/supabase/admin";

export type LastDayCounter = {
  id: string;
  category_name: string;
  scope: "company" | "store";
  store_id: string | null;
  remaining_count: number;
  is_active: boolean;
  show_on_home: boolean;
  completed_at: string | null;
  created_at: string;
  store: { name: string } | Array<{ name: string }> | null;
};

export async function getLastDayCounters() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("last_day_counters")
    .select("id, category_name, scope, store_id, remaining_count, is_active, show_on_home, completed_at, created_at, store:stores(name)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as unknown as LastDayCounter[];
}

export function getCounterStoreName(counter: LastDayCounter) {
  return Array.isArray(counter.store) ? counter.store[0]?.name ?? "" : counter.store?.name ?? "";
}
