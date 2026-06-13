import type { UserRole } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const POPUP_ANNOUNCEMENT_BUCKET = "popup-announcements";

export type PopupAnnouncementRecord = {
  id: string;
  title: string;
  body: string;
  image_path: string | null;
  imageUrl: string | null;
  target_roles: UserRole[] | null;
  show_from: string;
  show_until: string;
  is_active: boolean;
  created_at: string;
};

type PopupAnnouncementRow = {
  id: string;
  title: string;
  body: string;
  image_path: string | null;
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

function mapPopupAnnouncement(row: PopupAnnouncementRow): PopupAnnouncementRecord {
  const admin = createAdminClient();
  const imageUrl = row.image_path
    ? admin.storage.from(POPUP_ANNOUNCEMENT_BUCKET).getPublicUrl(row.image_path).data.publicUrl
    : null;

  return {
    ...row,
    imageUrl
  };
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
    .select("id, title, body, image_path, target_roles, show_from, show_until, is_active, created_at")
    .eq("is_active", true)
    .lte("show_from", nowIso)
    .gte("show_until", nowIso)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    return null;
  }

  const targetedRows = ((data as PopupAnnouncementRow[] | null) ?? []).filter((row) =>
    isTargeted(row.target_roles, profile.role)
  );

  if (targetedRows.length === 0) {
    return null;
  }

  return targetedRows[0] ? mapPopupAnnouncement(targetedRows[0]) : null;
}

export async function getAdminPopupAnnouncements() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("popup_announcements")
    .select("id, title, body, image_path, target_roles, show_from, show_until, is_active, created_at")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    return [];
  }

  return ((data as PopupAnnouncementRow[] | null) ?? []).map(mapPopupAnnouncement);
}
