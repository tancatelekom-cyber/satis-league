"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FeatureProfilePermissionMode } from "@/lib/feature-menu-permissions";

const REDIRECT_PATH = "/admin/eksik-evrak";

function redirectWithMessage(message: string, type: "success" | "error" = "success"): never {
  const params = new URLSearchParams({ message, type });
  redirect(`${REDIRECT_PATH}?${params.toString()}`);
}

export async function updateMissingDocsMenuPermissionAction(formData: FormData) {
  await requireAdminAccess();

  try {
    const featureKey = String(formData.get("featureKey") ?? "").trim();

    if (!featureKey) {
      throw new Error("Guncellenecek menu bulunamadi.");
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("feature_menu_permissions")
      .update({
        employee_visible: formData.get("employeeVisible") === "on",
        manager_visible: formData.get("managerVisible") === "on",
        management_visible: formData.get("managementVisible") === "on",
        admin_visible: formData.get("adminVisible") === "on",
        updated_at: new Date().toISOString()
      })
      .eq("feature_key", featureKey);

    if (error) {
      throw new Error(`Eksik Evrak menusu guncellenemedi: ${error.message}`);
    }

    revalidatePath("/", "layout");
    revalidatePath("/eksik-evrak");
    revalidatePath(REDIRECT_PATH);
    redirectWithMessage("Eksik Evrak menu yetkileri guncellendi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Eksik Evrak menu yetkileri guncellenemedi.", "error");
  }
}

export async function updateMissingDocsUserPermissionAction(formData: FormData) {
  await requireAdminAccess();

  try {
    const featureKey = String(formData.get("featureKey") ?? "").trim();
    const profileId = String(formData.get("profileId") ?? "").trim();
    const mode = String(formData.get("mode") ?? "").trim() as FeatureProfilePermissionMode;

    if (!featureKey || !profileId || !["inherit", "allow", "deny"].includes(mode)) {
      throw new Error("Kullanici izin bilgisi eksik.");
    }

    const admin = createAdminClient();

    if (mode === "inherit") {
      const { error } = await admin
        .from("feature_profile_permissions")
        .delete()
        .eq("feature_key", featureKey)
        .eq("profile_id", profileId);

      if (error) {
        throw new Error(`Kullanici izni sifirlanamadi: ${error.message}`);
      }
    } else {
      const { error } = await admin.from("feature_profile_permissions").upsert(
        {
          feature_key: featureKey,
          profile_id: profileId,
          is_allowed: mode === "allow",
          updated_at: new Date().toISOString()
        },
        {
          onConflict: "feature_key,profile_id"
        }
      );

      if (error) {
        throw new Error(`Kullanici izni kaydedilemedi: ${error.message}`);
      }
    }

    revalidatePath("/", "layout");
    revalidatePath("/eksik-evrak");
    revalidatePath(REDIRECT_PATH);
    redirectWithMessage("Kullanici bazli Eksik Evrak yetkisi guncellendi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Kullanici bazli Eksik Evrak yetkisi guncellenemedi.", "error");
  }
}
