"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { POPUP_ANNOUNCEMENT_BUCKET } from "@/lib/popup-announcements";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types";

const roleValues = new Set<UserRole>(["employee", "manager", "management", "admin"]);
const allowedPopupImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxPopupImageSize = 5 * 1024 * 1024;

function redirectWithMessage(message: string, type: "success" | "error" = "success"): never {
  const params = new URLSearchParams({ message, type });
  redirect(`/admin/bildirimler?${params.toString()}`);
}

function toIstanbulIso(value: FormDataEntryValue | null) {
  const rawValue = typeof value === "string" ? value.trim() : "";

  if (!rawValue) {
    return null;
  }

  const isoValue = new Date(`${rawValue}:00+03:00`).toISOString();

  if (Number.isNaN(new Date(isoValue).getTime())) {
    return null;
  }

  return isoValue;
}

function parseTargetRoles(formData: FormData) {
  const rawRoles = formData.getAll("targetRoles").map((value) => String(value));

  return Array.from(new Set(rawRoles)).filter((role): role is UserRole => roleValues.has(role as UserRole));
}

async function uploadPopupAnnouncementImage(file: File) {
  if (!file || file.size === 0) {
    return null;
  }

  if (!allowedPopupImageTypes.has(file.type)) {
    throw new Error("Popup gorseli icin sadece JPG, PNG veya WEBP yukleyebilirsiniz.");
  }

  if (file.size > maxPopupImageSize) {
    throw new Error("Popup gorseli en fazla 5 MB olabilir.");
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${fileBuffer.toString("base64")}`;
}

export async function createPopupAnnouncementAction(formData: FormData) {
  const { profile } = await requireAdminAccess();

  try {
    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    const showFrom = toIstanbulIso(formData.get("showFrom"));
    const showUntil = toIstanbulIso(formData.get("showUntil"));
    const targetRoles = parseTargetRoles(formData);
    const imageFile = formData.get("image");

    if (!title || !body || !showFrom || !showUntil) {
      redirectWithMessage("Baslik, metin, baslangic ve bitis tarihi zorunludur.", "error");
    }

    if (new Date(showUntil).getTime() <= new Date(showFrom).getTime()) {
      redirectWithMessage("Bitis tarihi baslangic tarihinden sonra olmali.", "error");
    }

    const admin = createAdminClient();
    const uploadedImagePath = imageFile instanceof File ? await uploadPopupAnnouncementImage(imageFile) : null;
    const { error } = await admin.from("popup_announcements").insert({
      title,
      body,
      image_path: uploadedImagePath,
      target_roles: targetRoles,
      show_from: showFrom,
      show_until: showUntil,
      created_by: profile.id
    });

    if (error) {
      redirectWithMessage(`Bildirim olusturulamadi: ${error.message}`, "error");
    }

    revalidatePath("/");
    revalidatePath("/admin/bildirimler");
    redirectWithMessage("Popup bildirim olusturuldu.");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Popup bildirim olusturulamadi. Popup gorsel bucket ve schema degisikliklerini kontrol edin.";

    redirectWithMessage(message, "error");
  }
}

export async function togglePopupAnnouncementAction(formData: FormData) {
  await requireAdminAccess();
  const id = String(formData.get("id") ?? "").trim();
  const isActive = String(formData.get("isActive") ?? "") === "true";

  if (!id) {
    redirectWithMessage("Bildirim bulunamadi.", "error");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("popup_announcements").update({ is_active: !isActive }).eq("id", id);

  if (error) {
    redirectWithMessage(`Bildirim guncellenemedi: ${error.message}`, "error");
  }

  revalidatePath("/");
  revalidatePath("/admin/bildirimler");
  redirectWithMessage(isActive ? "Bildirim pasife alindi." : "Bildirim aktif edildi.");
}

export async function deletePopupAnnouncementAction(formData: FormData) {
  await requireAdminAccess();
  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    redirectWithMessage("Bildirim bulunamadi.", "error");
  }

  const admin = createAdminClient();
  const { data: announcement, error: announcementError } = await admin
    .from("popup_announcements")
    .select("id, image_path")
    .eq("id", id)
    .single();

  if (announcementError || !announcement) {
    redirectWithMessage("Bildirim bulunamadi.", "error");
  }

  const { error } = await admin.from("popup_announcements").delete().eq("id", id);

  if (error) {
    redirectWithMessage(`Bildirim silinemedi: ${error.message}`, "error");
  }

  if (announcement.image_path) {
    if (!announcement.image_path.startsWith("data:")) {
      await admin.storage.from(POPUP_ANNOUNCEMENT_BUCKET).remove([announcement.image_path]);
    }
  }

  revalidatePath("/");
  revalidatePath("/admin/bildirimler");
  redirectWithMessage("Bildirim silindi.");
}
