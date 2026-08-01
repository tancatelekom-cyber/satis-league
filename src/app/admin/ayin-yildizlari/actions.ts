"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const REDIRECT_PATH = "/admin/ayin-yildizlari";

function redirectWithMessage(
  message: string,
  type: "success" | "error" = "success",
  redirectPath = REDIRECT_PATH
): never {
  const params = new URLSearchParams({ message, type });
  redirect(`${redirectPath}?${params.toString()}`);
}

export async function updateHomeLeaderPeriodAction(formData: FormData) {
  const { profile } = await requireAdminAccess();
  const requestedRedirectPath = String(formData.get("redirectTo") ?? "").trim();
  const redirectPath =
    requestedRedirectPath === "/admin" || requestedRedirectPath === REDIRECT_PATH
      ? requestedRedirectPath
      : REDIRECT_PATH;

  try {
    const displayMonth = String(formData.get("displayMonth") ?? "").trim();

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(displayMonth)) {
      throw new Error("Gecerli bir yil ve ay secmelisiniz.");
    }

    const admin = createAdminClient();
    const { data: existingRow, error: existingError } = await admin
      .from("home_leader_settings")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Ayar okunamadi: ${existingError.message}`);
    }

    const payload = {
      display_month: `${displayMonth}-01`,
      updated_by: profile.id,
      updated_at: new Date().toISOString()
    };
    const result = existingRow?.id
      ? await admin.from("home_leader_settings").update(payload).eq("id", existingRow.id)
      : await admin.from("home_leader_settings").insert(payload);

    if (result.error) {
      throw new Error(`Ayar kaydedilemedi: ${result.error.message}`);
    }
  } catch (error) {
    redirectWithMessage(
      error instanceof Error ? error.message : "Donem guncellenemedi.",
      "error",
      redirectPath
    );
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(REDIRECT_PATH);
  redirectWithMessage(
    "Ana ekranda gosterilecek Ayin Yildizlari donemi guncellendi.",
    "success",
    redirectPath
  );
}
