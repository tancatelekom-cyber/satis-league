import type { UserRole } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type FeatureMenuKey = "web-kontor";

export type FeatureMenuPermission = {
  key: FeatureMenuKey;
  label: string;
  employeeVisible: boolean;
  managerVisible: boolean;
  managementVisible: boolean;
  adminVisible: boolean;
};

type FeatureMenuPermissionRow = {
  feature_key: FeatureMenuKey;
  label: string;
  employee_visible: boolean | null;
  manager_visible: boolean | null;
  management_visible: boolean | null;
  admin_visible: boolean | null;
};

const DEFAULT_FEATURE_MENU_PERMISSIONS: FeatureMenuPermission[] = [
  {
    key: "web-kontor",
    label: "Web Kontor Menusu",
    employeeVisible: false,
    managerVisible: true,
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
