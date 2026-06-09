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
  const profileIds = String(formData.get("profileIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const { data: actor } = await admin
    .from("profiles")
    .select("id, role, approval, store_id")
    .eq("id", user.id)
    .single();

  if (!actor || actor.approval !== "approved" || !["employee", "manager", "management", "admin"].includes(actor.role)) {
    redirect(buildRedirectTarget(weekStart, redirectStoreId, redirectDay, "Bu islemi yapmaya yetkiniz yok.", "error"));
  }

  if (!["manager", "management", "admin"].includes(actor.role)) {
    redirect(buildRedirectTarget(weekStart, redirectStoreId, redirectDay, "Bu tabloyu sadece yetkili kullanicilar guncelleyebilir.", "error"));
  }

  if (profileIds.length === 0) {
    redirect(buildRedirectTarget(weekStart, redirectStoreId, redirectDay, "Kaydedilecek personel bulunamadi.", "error"));
  }

  const targetProfiles =
    (((await admin
      .from("profiles")
      .select("id, role, approval, store_id")
      .in("id", profileIds)).data as Array<{
      id: string;
      role: string;
      approval: string;
      store_id: string | null;
    }> | null) ?? []);

  if (targetProfiles.length !== profileIds.length) {
    redirect(buildRedirectTarget(weekStart, redirectStoreId, redirectDay, "Secilen personellerin bir kismi bulunamadi.", "error"));
  }

  for (const targetProfile of targetProfiles) {
    if (targetProfile.approval !== "approved" || !targetProfile.store_id || !["employee", "manager"].includes(targetProfile.role)) {
      redirect(buildRedirectTarget(weekStart, redirectStoreId, redirectDay, "Secilen tablo kaydi guncellenemedi.", "error"));
    }

    if (actor.role === "manager" && targetProfile.store_id !== actor.store_id) {
      redirect(buildRedirectTarget(weekStart, redirectStoreId, redirectDay, "Mudur sadece kendi magazasindaki personel icin giris yapabilir.", "error"));
    }
  }

  const existingRows =
    (((await admin
      .from("weekly_work_schedules")
      .select("profile_id, day_of_week, status, start_time, end_time")
      .eq("week_start", weekStart)
      .in("profile_id", profileIds)).data as Array<{
      profile_id: string;
      day_of_week: number;
      status: WorkScheduleStatus;
      start_time: string | null;
      end_time: string | null;
    }> | null) ?? []);
  const existingByKey = new Map(existingRows.map((item) => [`${item.profile_id}-${item.day_of_week}`, item]));

  const rows = [];

  for (const targetProfile of targetProfiles) {
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      const prefix = `${targetProfile.id}_${dayOfWeek}`;
      const statusInput = String(formData.get(`${prefix}_status`) ?? "off").trim();
      const status = isValidStatus(statusInput) ? statusInput : "off";
      let startTime = String(formData.get(`${prefix}_start`) ?? "").trim() || null;
      let endTime = String(formData.get(`${prefix}_end`) ?? "").trim() || null;

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
        profile_id: targetProfile.id,
        store_id: targetProfile.store_id,
        week_start: weekStart,
        day_of_week: dayOfWeek,
        status,
        start_time: status === "work" ? startTime : null,
        end_time: status === "work" ? endTime : null,
        updated_at: new Date().toISOString()
      });
    }
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
