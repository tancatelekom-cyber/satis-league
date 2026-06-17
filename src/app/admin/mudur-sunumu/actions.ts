"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerPresentationSections } from "@/lib/admin/manager-presentation-sections";

const REDIRECT_PATH = "/admin/mudur-sunumu";

function redirectWithMessage(message: string, type: "success" | "error" = "success") {
  const params = new URLSearchParams({ message, type });
  redirect(`${REDIRECT_PATH}?${params.toString()}`);
}

async function applyManagerPresentationSectionOrder(sectionKeys: string[]) {
  const admin = createAdminClient();

  await Promise.all(
    sectionKeys.map((sectionKey, index) =>
      admin
        .from("manager_presentation_sections")
        .update({
          sort_order: index,
          updated_at: new Date().toISOString()
        })
        .eq("section_key", sectionKey)
    )
  );
}

export async function toggleManagerPresentationSectionVisibilityAction(formData: FormData) {
  await requireAdminAccess();

  try {
    const sectionKey = String(formData.get("sectionKey") ?? "").trim();
    const nextVisibility = String(formData.get("nextVisibility") ?? "").trim() === "true";

    if (!sectionKey) {
      throw new Error("Bolum secilemedi.");
    }

    const { persisted } = await getManagerPresentationSections();

    if (!persisted) {
      throw new Error("Sunum siralama tablosu bulunamadi. Once schema.sql degisikliklerini Supabase uzerine uygulayin.");
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("manager_presentation_sections")
      .update({
        is_visible: nextVisibility,
        updated_at: new Date().toISOString()
      })
      .eq("section_key", sectionKey);

    if (error) {
      throw new Error(`Sunum bolumu guncellenemedi: ${error.message}`);
    }

    revalidatePath(REDIRECT_PATH);
    redirectWithMessage(nextVisibility ? "Sunum bolumu tekrar gosterildi." : "Sunum bolumu gizlendi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Sunum bolumu guncellenemedi.", "error");
  }
}

export async function moveManagerPresentationSectionAction(formData: FormData) {
  await requireAdminAccess();

  try {
    const sectionKey = String(formData.get("sectionKey") ?? "").trim();
    const direction = String(formData.get("direction") ?? "").trim();

    if (!sectionKey || !["up", "down"].includes(direction)) {
      throw new Error("Tasima bilgisi eksik.");
    }

    const { sections, persisted } = await getManagerPresentationSections();

    if (!persisted) {
      throw new Error("Sunum siralama tablosu bulunamadi. Once schema.sql degisikliklerini Supabase uzerine uygulayin.");
    }

    const currentIndex = sections.findIndex((section) => section.key === sectionKey);

    if (currentIndex < 0) {
      throw new Error("Sunum bolumu bulunamadi.");
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= sections.length) {
      revalidatePath(REDIRECT_PATH);
      redirectWithMessage("Bolum zaten sinirda.");
    }

    const reorderedKeys = sections.map((section) => section.key);
    const [movedKey] = reorderedKeys.splice(currentIndex, 1);
    reorderedKeys.splice(targetIndex, 0, movedKey);

    await applyManagerPresentationSectionOrder(reorderedKeys);

    revalidatePath(REDIRECT_PATH);
    redirectWithMessage("Sunum sayfa sirasi guncellendi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Sunum sayfa sirasi guncellenemedi.", "error");
  }
}
