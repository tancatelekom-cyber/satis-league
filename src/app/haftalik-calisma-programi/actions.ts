"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeWeekStart,
  parseTimeToMinutes,
  type WorkScheduleStatus
} from "@/lib/work-schedules";

function buildRedirectTarget(weekStart: string, storeId: string, day: string, message?: string, type?: "success" | "error") {
  const params = new URLSearchParams({ week: weekStart });

  if (storeId) {
    params.set("store", storeId);
  }

  if (day) {
    params.set("day", day);
  }

  if (message) {
    params.set("message", message);
  }

  if (type) {
    params.set("type", type);
  }

  return `/haftalik-calisma-programi?${params.toString()}`;
}

function isValidStatus(value: string): value is WorkScheduleStatus {
  return value === "work" || value === "leave" || value === "off";
}

export async function saveWeeklyWorkScheduleAction(formData: FormData) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const weekStart = normalizeWeekStart(String(formData.get("weekStart") ?? ""));
  const redirectStoreId = String(formData.get("redirectStoreId") ?? "").trim();
  const redirectDay = String(formData.get("redirectDay") ?? "").trim();

  const { data: actor } = await admin
    .from("profiles")
    .select("id, role, approval, store_id")
    .eq("id", user.id)
    .single();

  if (!actor || actor.approval !== "approved" || !["employee", "manager"].includes(actor.role) || !actor.store_id) {
    redirect(buildRedirectTarget(weekStart, redirectStoreId, redirectDay, "Bu islemi yapmaya yetkiniz yok.", "error"));
  }

  const rows = [];

  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    const statusInput = String(formData.get(`day_${dayOfWeek}_status`) ?? "off").trim();
    const status = isValidStatus(statusInput) ? statusInput : "off";
    const startTime = String(formData.get(`day_${dayOfWeek}_start`) ?? "").trim() || null;
    const endTime = String(formData.get(`day_${dayOfWeek}_end`) ?? "").trim() || null;

    if (status === "work") {
      const startMinutes = parseTimeToMinutes(startTime);
      const endMinutes = parseTimeToMinutes(endTime);

      if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
        redirect(
          buildRedirectTarget(
            weekStart,
            redirectStoreId,
            redirectDay,
            "Calisma saatlerinde baslangic bitisten once olmali.",
            "error"
          )
        );
      }
    }

    rows.push({
      profile_id: actor.id,
      store_id: actor.store_id,
      week_start: weekStart,
      day_of_week: dayOfWeek,
      status,
      start_time: status === "work" ? startTime : null,
      end_time: status === "work" ? endTime : null,
      updated_at: new Date().toISOString()
    });
  }

  const { error } = await admin.from("weekly_work_schedules").upsert(rows, {
    onConflict: "profile_id,week_start,day_of_week"
  });

  if (error) {
    redirect(buildRedirectTarget(weekStart, redirectStoreId, redirectDay, `Kayit yapilamadi: ${error.message}`, "error"));
  }

  revalidatePath("/haftalik-calisma-programi");
  redirect(buildRedirectTarget(weekStart, redirectStoreId, redirectDay, "Haftalik calisma programi kaydedildi.", "success"));
}
