import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types";

export type AutoPopupSettingKey =
  | "inactive-login-reminder"
  | "document-issue-reminder"
  | "goal-daily-need-reminder"
  | "weekly-schedule-reminder";

export type AutoPopupSetting = {
  key: AutoPopupSettingKey;
  label: string;
  description: string;
  is_active: boolean;
  target_roles: UserRole[];
  updated_at?: string | null;
};

type AutoPopupSettingRow = {
  notification_key: AutoPopupSettingKey;
  label: string;
  description: string;
  is_active: boolean;
  target_roles: UserRole[] | null;
  updated_at?: string | null;
};

export const autoPopupSettingDefaults: AutoPopupSetting[] = [
  {
    key: "inactive-login-reminder",
    label: "Portala Giris Hatirlatmasi",
    description: "2 gun ve uzeri giris yapmayan kullanicilara acilan otomatik popup.",
    is_active: true,
    target_roles: ["employee", "manager", "management", "admin"]
  },
  {
    key: "document-issue-reminder",
    label: "Eksik ve Ulasmayan Evrak Uyarisi",
    description: "Eksik evrak ve ulasmayan evrak adetlerini popup olarak gosterir.",
    is_active: true,
    target_roles: ["employee", "manager", "management", "admin"]
  },
  {
    key: "goal-daily-need-reminder",
    label: "Gunluk Ihtiyac ve Eksik Kalem Hatirlatmasi",
    description: "Hedef Gerceklesen verilerine gore kisinin veya magazanin gunluk ihtiyaclarini popup icinde gosterir.",
    is_active: true,
    target_roles: ["employee", "manager", "management", "admin"]
  },
  {
    key: "weekly-schedule-reminder",
    label: "Haftalik Calisma Programi Hatirlatmasi",
    description: "Magaza mudurune kendi magazasi, yonetim ve admine ise eksik magazalar icin haftalik program uyarisi gosterir.",
    is_active: true,
    target_roles: ["manager", "management", "admin"]
  }
];

function normalizeRoles(targetRoles: UserRole[] | null | undefined) {
  return Array.from(new Set((targetRoles ?? []).filter(Boolean)));
}

function toSettingMap(rows: AutoPopupSettingRow[] | null | undefined) {
  const rowMap = new Map((rows ?? []).map((row) => [row.notification_key, row]));

  return autoPopupSettingDefaults.map((defaultRow) => {
    const matched = rowMap.get(defaultRow.key);

    return {
      key: defaultRow.key,
      label: matched?.label?.trim() || defaultRow.label,
      description: matched?.description?.trim() || defaultRow.description,
      is_active: matched?.is_active ?? defaultRow.is_active,
      target_roles: normalizeRoles(matched?.target_roles ?? defaultRow.target_roles),
      updated_at: matched?.updated_at ?? null
    } satisfies AutoPopupSetting;
  });
}

export async function getAdminAutoPopupSettings() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("auto_popup_notification_settings")
      .select("notification_key, label, description, is_active, target_roles, updated_at")
      .order("notification_key", { ascending: true });

    if (error) {
      return autoPopupSettingDefaults;
    }

    return toSettingMap((data as AutoPopupSettingRow[] | null) ?? []);
  } catch {
    return autoPopupSettingDefaults;
  }
}

export async function getAutoPopupSettingsMap() {
  const settings = await getAdminAutoPopupSettings();
  return new Map(settings.map((item) => [item.key, item]));
}

export function canShowAutoPopupForRole(
  settingsMap: Map<AutoPopupSettingKey, AutoPopupSetting>,
  key: AutoPopupSettingKey,
  role: UserRole
) {
  const matched = settingsMap.get(key);
  if (!matched) {
    return true;
  }

  return matched.is_active && matched.target_roles.includes(role);
}
