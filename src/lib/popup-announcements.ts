import type { UserRole } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const POPUP_ANNOUNCEMENT_BUCKET = "popup-announcements";
export type PopupAnnouncementTargetMode = "role" | "profile";

export type PopupAnnouncementTargetProfile = {
  id: string;
  full_name: string;
  role: UserRole;
  store_name: string | null;
};

export type PopupAnnouncementRecord = {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  image_path: string | null;
  imageUrl: string | null;
  target_mode: PopupAnnouncementTargetMode;
  target_roles: UserRole[] | null;
  target_profile_ids: string[] | null;
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
  target_mode: PopupAnnouncementTargetMode | null;
  target_roles: UserRole[] | null;
  target_profile_ids: string[] | null;
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

function isProfileTargeted(targetProfileIds: string[] | null | undefined, profileId: string) {
  return Array.isArray(targetProfileIds) && targetProfileIds.includes(profileId);
}

export function formatPopupTargets(targetRoles: UserRole[] | null | undefined) {
  if (!targetRoles || targetRoles.length === 0) {
    return "Tum kullanicilar";
  }

  return targetRoles
    .map((role) => popupTargetOptions.find((option) => option.value === role)?.label ?? role)
    .join(", ");
}

export function formatPopupAudience(
  announcement: Pick<PopupAnnouncementRecord, "target_mode" | "target_roles" | "target_profile_ids">,
  profilesById?: Map<string, PopupAnnouncementTargetProfile>
) {
  if (announcement.target_mode === "profile") {
    const targetIds = announcement.target_profile_ids ?? [];

    if (!targetIds.length) {
      return "Kisi bazli: secili kullanici yok";
    }

    const labels = targetIds.map((id) => profilesById?.get(id)?.full_name ?? "Bilinmeyen kullanici");
    const preview = labels.slice(0, 4).join(", ");
    const extraCount = labels.length - 4;

    return extraCount > 0 ? `Kisi bazli: ${preview} +${extraCount}` : `Kisi bazli: ${preview}`;
  }

  return `Gorev bazli: ${formatPopupTargets(announcement.target_roles)}`;
}

async function mapPopupAnnouncement(row: PopupAnnouncementRow): Promise<PopupAnnouncementRecord> {
  const imageUrl = await resolvePopupImageUrl(row.image_path);
  const normalizedLink =
    typeof row.link_url === "string" && row.link_url.trim().length > 0 ? row.link_url.trim() : null;

  return {
    ...row,
    target_mode: row.target_mode === "profile" ? "profile" : "role",
    target_profile_ids: row.target_profile_ids ?? [],
    link_url: normalizedLink,
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
    .select(
      "id, title, body, link_url, image_path, target_mode, target_roles, target_profile_ids, show_from, show_until, is_active, created_at"
    )
    .eq("is_active", true)
    .lte("show_from", nowIso)
    .gte("show_until", nowIso)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    return [];
  }

  const targetedRows = ((data as PopupAnnouncementRow[] | null) ?? []).filter((row) =>
    (row.target_mode === "profile" && isProfileTargeted(row.target_profile_ids, profile.id)) ||
    ((row.target_mode === "role" || !row.target_mode) && isTargeted(row.target_roles, profile.role))
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
    .select(
      "id, title, body, link_url, image_path, target_mode, target_roles, target_profile_ids, show_from, show_until, is_active, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    return [];
  }

  return await Promise.all(((data as PopupAnnouncementRow[] | null) ?? []).map((row) => mapPopupAnnouncement(row)));
}

export async function getApprovedPopupTargetProfiles() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, role, store:stores(name)")
    .eq("approval", "approved")
    .order("full_name", { ascending: true });

  if (error) {
    return [] as PopupAnnouncementTargetProfile[];
  }

  return ((data as Array<{
    id: string;
    full_name: string;
    role: UserRole;
    store: { name: string } | { name: string }[] | null;
  }> | null) ?? [])
    .filter((profile) => profile.full_name)
    .map((profile) => ({
      id: profile.id,
      full_name: profile.full_name,
      role: profile.role,
      store_name: Array.isArray(profile.store) ? (profile.store[0]?.name ?? null) : (profile.store?.name ?? null)
    }));
}
