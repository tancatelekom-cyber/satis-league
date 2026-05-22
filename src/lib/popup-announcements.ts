import type { UserRole } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type PopupAnnouncementRecord = {
  id: string;
  title: string;
  body: string;
  target_roles: UserRole[] | null;
  show_from: string;
  show_until: string;
  is_active: boolean;
  created_at: string;
};

export const popupTargetOptions: Array<{ value: UserRole; label: string }> = [
  { value: "employee", label: "Calisan" },
  { value: "manager", label: "Magaza Muduru" },
  { value: "management", label: "Yonetim" },
  { value: "admin", label: "Admin" }
];

function isTargeted(targetRoles: UserRole[] | null | undefined, role: UserRole) {
  return !targetRoles || targetRoles.length === 0 || targetRoles.includes(role);
}

export function formatPopupTargets(targetRoles: UserRole[] | null | undefined) {
  if (!targetRoles || targetRoles.length === 0) {
    return "Tum kullanicilar";
  }

  return targetRoles
    .map((role) => popupTargetOptions.find((option) => option.value === role)?.label ?? role)
    .join(", ");
}

export async function getActivePopupAnnouncementForProfile(profile: {
  id: string;
  role: UserRole;
  approval?: string | null;
}) {
  if (profile.approval !== "approved") {
    return null;
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("popup_announcements")
    .select("id, title, body, target_roles, show_from, show_until, is_active, created_at")
    .eq("is_active", true)
    .lte("show_from", nowIso)
    .gte("show_until", nowIso)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    return null;
  }

  const targetedRows = ((data as PopupAnnouncementRecord[] | null) ?? []).filter((row) =>
    isTargeted(row.target_roles, profile.role)
  );

  if (targetedRows.length === 0) {
    return null;
  }

  const { data: dismissals } = await admin
    .from("popup_announcement_dismissals")
    .select("announcement_id")
    .eq("profile_id", profile.id)
    .in(
      "announcement_id",
      targetedRows.map((row) => row.id)
    );

  const dismissedIds = new Set(
    ((dismissals as Array<{ announcement_id: string }> | null) ?? []).map((row) => row.announcement_id)
  );

  return targetedRows.find((row) => !dismissedIds.has(row.id)) ?? null;
}

export async function getAdminPopupAnnouncements() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("popup_announcements")
    .select("id, title, body, target_roles, show_from, show_until, is_active, created_at")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    return [];
  }

  return (data as PopupAnnouncementRecord[] | null) ?? [];
}
