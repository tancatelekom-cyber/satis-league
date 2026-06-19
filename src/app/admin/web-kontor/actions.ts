"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const REDIRECT_PATH = "/admin/web-kontor";

function redirectWithMessage(message: string, type: "success" | "error" = "success"): never {
  const params = new URLSearchParams({ message, type });
  redirect(`${REDIRECT_PATH}?${params.toString()}`);
}

export async function updateWebKontorMenuPermissionAction(formData: FormData) {
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
      throw new Error(`Web Kontor menusu guncellenemedi: ${error.message}`);
    }

    revalidatePath("/", "layout");
    revalidatePath("/web-kontor");
    revalidatePath(REDIRECT_PATH);
    redirectWithMessage("Web Kontor menu yetkileri guncellendi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Web Kontor menu yetkileri guncellenemedi.", "error");
  }
}
