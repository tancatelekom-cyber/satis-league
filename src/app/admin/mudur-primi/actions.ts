"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import type { FeatureProfilePermissionMode } from "@/lib/feature-menu-permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const REDIRECT_PATH = "/admin/mudur-primi";

function redirectWithMessage(message: string, type: "success" | "error" = "success"): never {
  const params = new URLSearchParams({ message, type });
  redirect(`${REDIRECT_PATH}?${params.toString()}`);
}

export async function updateManagerPrimeMenuPermissionAction(formData: FormData) {
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
      throw new Error(`Mudur primi menusu guncellenemedi: ${error.message}`);
    }

    revalidatePath("/", "layout");
    revalidatePath("/magaza-muduru-primi");
    revalidatePath(REDIRECT_PATH);
    redirectWithMessage("Mudur primi menu yetkileri guncellendi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Mudur primi menu yetkileri guncellenemedi.", "error");
  }
}

export async function updateManagerPrimeUserPermissionAction(formData: FormData) {
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
    revalidatePath("/magaza-muduru-primi");
    revalidatePath(REDIRECT_PATH);
    redirectWithMessage("Kullanici bazli mudur primi yetkisi guncellendi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Kullanici bazli mudur primi yetkisi guncellenemedi.", "error");
  }
}

export async function updateManagerPrimeMappingAction(formData: FormData) {
  await requireAdminAccess();

  try {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("manager_prime_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    const payload = {
      scale_column: String(formData.get("scaleColumn") ?? "A").trim().toUpperCase(),
      recontract_category: String(formData.get("recontractCategory") ?? "").trim(),
      recontract_column: String(formData.get("recontractColumn") ?? "B").trim().toUpperCase(),
      production_category: String(formData.get("productionCategory") ?? "").trim(),
      production_column: String(formData.get("productionColumn") ?? "D").trim().toUpperCase(),
      activation_category: String(formData.get("activationCategory") ?? "").trim(),
      activation_column: String(formData.get("activationColumn") ?? "E").trim().toUpperCase(),
      terminal_category: String(formData.get("terminalCategory") ?? "").trim(),
      terminal_column: String(formData.get("terminalColumn") ?? "F").trim().toUpperCase(),
      sol_category: String(formData.get("solCategory") ?? "").trim(),
      sol_column: String(formData.get("solColumn") ?? "G").trim().toUpperCase(),
      accessory_category: String(formData.get("accessoryCategory") ?? "").trim(),
      accessory_column: String(formData.get("accessoryColumn") ?? "H").trim().toUpperCase(),
      updated_by: null,
      updated_at: new Date().toISOString()
    };

    if (
      !payload.recontract_category ||
      !payload.production_category ||
      !payload.activation_category ||
      !payload.terminal_category ||
      !payload.sol_category ||
      !payload.accessory_category
    ) {
      throw new Error("Tum kategori eslesmeleri secilmelidir.");
    }

    const { error } = existing?.id
      ? await admin.from("manager_prime_settings").update(payload).eq("id", existing.id)
      : await admin.from("manager_prime_settings").insert(payload);

    if (error) {
      throw new Error(`Kategori-sutun eslesmesi kaydedilemedi: ${error.message}`);
    }

    revalidatePath("/magaza-muduru-primi");
    revalidatePath(REDIRECT_PATH);
    redirectWithMessage("Mudur primi kategori ve sutun eslesmeleri kaydedildi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Kategori-sutun eslesmesi kaydedilemedi.", "error");
  }
}
