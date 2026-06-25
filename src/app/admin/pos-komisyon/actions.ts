"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { normalizePosCommissionPercent } from "@/lib/pos-commission";
import { createAdminClient } from "@/lib/supabase/admin";

const REDIRECT_PATH = "/admin/pos-komisyon";

function redirectWithMessage(message: string, type: "success" | "error" = "success"): never {
  const params = new URLSearchParams({ message, type });
  redirect(`${REDIRECT_PATH}?${params.toString()}`);
}

export async function updatePosCommissionAction(formData: FormData) {
  await requireAdminAccess();

  try {
    const rawCommission = String(formData.get("commissionPercent") ?? "").trim().replace(",", ".");
    const parsedCommission = Number(rawCommission);

    if (!Number.isFinite(parsedCommission)) {
      throw new Error("Komisyon orani sayisal olmali.");
    }

    const commissionPercent = normalizePosCommissionPercent(parsedCommission);

    if (commissionPercent < 0 || commissionPercent > 100) {
      throw new Error("Komisyon orani 0 ile 100 arasinda olmali.");
    }

    const admin = createAdminClient();
    const { data: existingRow, error: existingError } = await admin
      .from("pos_commission_settings")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw new Error(`POS komisyon ayari okunamadi: ${existingError.message}`);
    }

    if (existingRow?.id) {
      const { error } = await admin
        .from("pos_commission_settings")
        .update({
          commission_percent: commissionPercent,
          updated_at: new Date().toISOString(),
          updated_by: null
        })
        .eq("id", existingRow.id);

      if (error) {
        throw new Error(`POS komisyon ayari guncellenemedi: ${error.message}`);
      }
    } else {
      const { error } = await admin.from("pos_commission_settings").insert({
        commission_percent: commissionPercent,
        updated_by: null
      });

      if (error) {
        throw new Error(`POS komisyon ayari kaydedilemedi: ${error.message}`);
      }
    }

    revalidatePath("/", "layout");
    revalidatePath("/pos-komisyon");
    revalidatePath("/admin");
    revalidatePath(REDIRECT_PATH);
    redirectWithMessage("POS komisyon orani guncellendi.");
  } catch (error) {
    redirectWithMessage(
      error instanceof Error ? error.message : "POS komisyon orani guncellenemedi.",
      "error"
    );
  }
}
