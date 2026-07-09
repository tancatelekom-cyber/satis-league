import type { UserRole } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type FeatureMenuKey = "web-kontor" | "eksik-evrak" | "mudur-primi" | "gelir-gider";

export type FeatureMenuPermission = {
  key: FeatureMenuKey;
  label: string;
  employeeVisible: boolean;
  managerVisible: boolean;
  managementVisible: boolean;
  adminVisible: boolean;
};

export type FeatureProfilePermissionMode = "inherit" | "allow" | "deny";

export type FeatureProfilePermission = {
  profileId: string;
  featureKey: FeatureMenuKey;
  isAllowed: boolean;
};

type FeatureMenuPermissionRow = {
  feature_key: FeatureMenuKey;
  label: string;
  employee_visible: boolean | null;
  manager_visible: boolean | null;
  management_visible: boolean | null;
  admin_visible: boolean | null;
};

type FeatureProfilePermissionRow = {
  profile_id: string;
  feature_key: FeatureMenuKey;
  is_allowed: boolean | null;
};

const DEFAULT_FEATURE_MENU_PERMISSIONS: FeatureMenuPermission[] = [
  {
    key: "web-kontor",
    label: "Web Kontor Menusu",
    employeeVisible: false,
    managerVisible: true,
    managementVisible: true,
    adminVisible: true
  },
  {
    key: "eksik-evrak",
    label: "Eksik Evrak Menusu",
    employeeVisible: true,
    managerVisible: true,
    managementVisible: true,
    adminVisible: true
  },
  {
    key: "mudur-primi",
    label: "Magaza Muduru Prim Menusu",
    employeeVisible: false,
    managerVisible: true,
    managementVisible: true,
    adminVisible: true
  },
  {
    key: "gelir-gider",
    label: "Gelir Gider Menusu",
    employeeVisible: false,
    managerVisible: false,
    managementVisible: true,
    adminVisible: true
  }
];

function normalizePermissions(rows: FeatureMenuPermissionRow[]) {
  const rowMap = new Map(rows.map((row) => [row.feature_key, row] as const));

  return DEFAULT_FEATURE_MENU_PERMISSIONS.map((permission) => {
    const matched = rowMap.get(permission.key);

    return {
      key: permission.key,
      label: matched?.label?.trim() || permission.label,
      employeeVisible: typeof matched?.employee_visible === "boolean" ? matched.employee_visible : permission.employeeVisible,
      managerVisible: typeof matched?.manager_visible === "boolean" ? matched.manager_visible : permission.managerVisible,
      managementVisible: typeof matched?.management_visible === "boolean" ? matched.management_visible : permission.managementVisible,
      adminVisible: typeof matched?.admin_visible === "boolean" ? matched.admin_visible : permission.adminVisible
    } satisfies FeatureMenuPermission;
  });
}

export async function getFeatureMenuPermissions() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("feature_menu_permissions")
      .select("feature_key, label, employee_visible, manager_visible, management_visible, admin_visible");

    if (error) {
      return {
        permissions: DEFAULT_FEATURE_MENU_PERMISSIONS,
        persisted: false
      };
    }

    const rows = (data as FeatureMenuPermissionRow[] | null) ?? [];
    const missingPermissions = DEFAULT_FEATURE_MENU_PERMISSIONS.filter(
      (permission) => !rows.some((row) => row.feature_key === permission.key)
    );

    if (missingPermissions.length > 0) {
      await admin.from("feature_menu_permissions").upsert(
        missingPermissions.map((permission) => ({
          feature_key: permission.key,
          label: permission.label,
          employee_visible: permission.employeeVisible,
          manager_visible: permission.managerVisible,
          management_visible: permission.managementVisible,
          admin_visible: permission.adminVisible
        })),
        {
          onConflict: "feature_key"
        }
      );
    }

    return {
      permissions: normalizePermissions([
        ...rows,
        ...missingPermissions.map((permission) => ({
          feature_key: permission.key,
          label: permission.label,
          employee_visible: permission.employeeVisible,
          manager_visible: permission.managerVisible,
          management_visible: permission.managementVisible,
          admin_visible: permission.adminVisible
        }))
      ]),
      persisted: true
    };
  } catch {
    return {
      permissions: DEFAULT_FEATURE_MENU_PERMISSIONS,
      persisted: false
    };
  }
}

export function canRoleAccessFeature(permission: FeatureMenuPermission | null | undefined, role: UserRole | null | undefined) {
  if (!permission || !role) {
    return false;
  }

  if (role === "admin") {
    return permission.adminVisible;
  }

  if (role === "management") {
    return permission.managementVisible;
  }

  if (role === "manager") {
    return permission.managerVisible;
  }

  return permission.employeeVisible;
}

export function getFeaturePermissionByKey(
  permissions: FeatureMenuPermission[],
  featureKey: FeatureMenuKey
) {
  return permissions.find((permission) => permission.key === featureKey) ?? null;
}

export async function getFeatureProfilePermissions(featureKey: FeatureMenuKey) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("feature_profile_permissions")
      .select("profile_id, feature_key, is_allowed")
      .eq("feature_key", featureKey);

    if (error) {
      return [];
    }

    return ((data as FeatureProfilePermissionRow[] | null) ?? [])
      .filter((row) => row.profile_id && typeof row.is_allowed === "boolean")
      .map((row) => ({
        profileId: row.profile_id,
        featureKey: row.feature_key,
        isAllowed: Boolean(row.is_allowed)
      })) satisfies FeatureProfilePermission[];
  } catch {
    return [];
  }
}

export function resolveFeatureProfilePermissionMode(
  profilePermissions: FeatureProfilePermission[],
  profileId: string,
  featureKey: FeatureMenuKey
): FeatureProfilePermissionMode {
  const matched = profilePermissions.find(
    (permission) => permission.profileId === profileId && permission.featureKey === featureKey
  );

  if (!matched) {
    return "inherit";
  }

  return matched.isAllowed ? "allow" : "deny";
}

export function canRoleAccessFeatureWithOverride(
  permission: FeatureMenuPermission | null | undefined,
  role: UserRole | null | undefined,
  overrideMode: FeatureProfilePermissionMode
) {
  if (overrideMode === "allow") {
    return true;
  }

  if (overrideMode === "deny") {
    return false;
  }

  return canRoleAccessFeature(permission, role);
}

export async function getResolvedFeatureAccessForProfile(
  featureKey: FeatureMenuKey,
  profileId: string,
  role: UserRole | null | undefined
) {
  const [{ permissions }, profilePermissions] = await Promise.all([
    getFeatureMenuPermissions(),
    getFeatureProfilePermissions(featureKey)
  ]);

  const permission = getFeaturePermissionByKey(permissions, featureKey);
  const overrideMode = resolveFeatureProfilePermissionMode(profilePermissions, profileId, featureKey);

  return {
    allowed: canRoleAccessFeatureWithOverride(permission, role, overrideMode),
    permission,
    overrideMode
  };
}
