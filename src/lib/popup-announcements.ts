import type { UserRole } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const POPUP_ANNOUNCEMENT_BUCKET = "popup-announcements";

export type PopupAnnouncementRecord = {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
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
  link_url: string | null;
  image_path: string | null;
  target_roles: UserRole[] | null;
  show_from: string;
  show_until: string;
  is_active: boolean;
  created_at: string;
};

async function resolvePopupImageUrl(imagePath: string | null) {
  if (!imagePath) {
    return null;
  }

  if (imagePath.startsWith("data:image/") || imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(POPUP_ANNOUNCEMENT_BUCKET).download(imagePath);

    if (error || !data) {
      return null;
    }

    const mimeType = data.type || "image/jpeg";
    const buffer = Buffer.from(await data.arrayBuffer());
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

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

async function mapPopupAnnouncement(row: PopupAnnouncementRow): Promise<PopupAnnouncementRecord> {
  const imageUrl = await resolvePopupImageUrl(row.image_path);

  return {
    ...row,
    imageUrl
  };
}

export async function getActivePopupAnnouncementsForProfile(profile: {
  id: string;
  role: UserRole;
  approval?: string | null;
}) {
  if (profile.approval !== "approved") {
    return [];
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("popup_announcements")
    .select("id, title, body, link_url, image_path, target_roles, show_from, show_until, is_active, created_at")
    .eq("is_active", true)
    .lte("show_from", nowIso)
    .gte("show_until", nowIso)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    return [];
  }

  const targetedRows = ((data as PopupAnnouncementRow[] | null) ?? []).filter((row) =>
    isTargeted(row.target_roles, profile.role)
  );

  if (targetedRows.length === 0) {
    return [];
  }

  return await Promise.all(targetedRows.map((row) => mapPopupAnnouncement(row)));
}

export async function getAdminPopupAnnouncements() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("popup_announcements")
    .select("id, title, body, link_url, image_path, target_roles, show_from, show_until, is_active, created_at")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    return [];
  }

  return await Promise.all(((data as PopupAnnouncementRow[] | null) ?? []).map((row) => mapPopupAnnouncement(row)));
}
