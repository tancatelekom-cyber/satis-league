"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { autoPopupSettingDefaults } from "@/lib/auto-popup-settings";
import { POPUP_ANNOUNCEMENT_BUCKET } from "@/lib/popup-announcements";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types";
import type { PopupAnnouncementTargetMode } from "@/lib/popup-announcements";

const roleValues = new Set<UserRole>(["employee", "manager", "management", "admin"]);
const allowedPopupImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxPopupImageSize = 5 * 1024 * 1024;

function isPopupTargetSchemaMissingError(message: string | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("target_mode") || normalized.includes("target_profile_ids");
}

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

function parseTargetMode(formData: FormData): PopupAnnouncementTargetMode {
  return String(formData.get("targetMode") ?? "").trim() === "profile" ? "profile" : "role";
}

function parseTargetProfileIds(formData: FormData) {
  return Array.from(
    new Set(
      formData
        .getAll("targetProfileIds")
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  );
}

function parseAutoPopupTargetRoles(formData: FormData) {
  const rawRoles = formData.getAll("targetRoles").map((value) => String(value));
  const uniqueRoles = Array.from(new Set(rawRoles)).filter((role): role is UserRole => roleValues.has(role as UserRole));

  return uniqueRoles.length > 0 ? uniqueRoles : ["employee", "manager", "management", "admin"];
}

function parseOptionalLink(value: FormDataEntryValue | null) {
  const rawValue = typeof value === "string" ? value.trim() : "";

  if (!rawValue) {
    return null;
  }

  if (rawValue.startsWith("/")) {
    return rawValue;
  }

  const normalizedValue =
    rawValue.startsWith("www.") || (!rawValue.includes("://") && rawValue.includes("."))
      ? `https://${rawValue}`
      : rawValue;

  try {
    const parsedUrl = new URL(normalizedValue);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return null;
    }
    return parsedUrl.toString();
  } catch {
    return null;
  }
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
    const linkUrl = parseOptionalLink(formData.get("linkUrl"));
    const showFrom = toIstanbulIso(formData.get("showFrom"));
    const showUntil = toIstanbulIso(formData.get("showUntil"));
    const targetMode = parseTargetMode(formData);
    const targetRoles = parseTargetRoles(formData);
    const targetProfileIds = parseTargetProfileIds(formData);
    const imageFile = formData.get("image");

    if (!title || !body || !showFrom || !showUntil) {
      redirectWithMessage("Baslik, metin, baslangic ve bitis tarihi zorunludur.", "error");
    }

    if (new Date(showUntil).getTime() <= new Date(showFrom).getTime()) {
      redirectWithMessage("Bitis tarihi baslangic tarihinden sonra olmali.", "error");
    }

    if (targetMode === "profile" && targetProfileIds.length === 0) {
      redirectWithMessage("Kisi bazli gonderim icin en az bir kullanici secmelisiniz.", "error");
    }

    const admin = createAdminClient();
    const uploadedImagePath = imageFile instanceof File ? await uploadPopupAnnouncementImage(imageFile) : null;
    let { error } = await admin.from("popup_announcements").insert({
      title,
      body,
      link_url: linkUrl,
      image_path: uploadedImagePath,
      target_mode: targetMode,
      target_roles: targetMode === "role" ? targetRoles : [],
      target_profile_ids: targetMode === "profile" ? targetProfileIds : [],
      show_from: showFrom,
      show_until: showUntil,
      created_by: profile.id
    });

    if (error && isPopupTargetSchemaMissingError(error.message)) {
      if (targetMode === "profile") {
        redirectWithMessage(
          "Kisi bazli popup icin once popup announcement SQL guncellemesini uygulamaniz gerekir.",
          "error"
        );
      }

      const fallback = await admin.from("popup_announcements").insert({
        title,
        body,
        link_url: linkUrl,
        image_path: uploadedImagePath,
        target_roles: targetRoles,
        show_from: showFrom,
        show_until: showUntil,
        created_by: profile.id
      });

      error = fallback.error;
    }

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

export async function updatePopupAnnouncementAction(formData: FormData) {
  await requireAdminAccess();

  try {
    const id = String(formData.get("id") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    const linkUrl = parseOptionalLink(formData.get("linkUrl"));
    const showFrom = toIstanbulIso(formData.get("showFrom"));
    const showUntil = toIstanbulIso(formData.get("showUntil"));
    const targetMode = parseTargetMode(formData);
    const targetRoles = parseTargetRoles(formData);
    const targetProfileIds = parseTargetProfileIds(formData);
    const imageFile = formData.get("image");
    const removeImage = String(formData.get("removeImage") ?? "") === "true";

    if (!id) {
      redirectWithMessage("Duzenlenecek bildirim bulunamadi.", "error");
    }

    if (!title || !body || !showFrom || !showUntil) {
      redirectWithMessage("Baslik, metin, baslangic ve bitis tarihi zorunludur.", "error");
    }

    if (new Date(showUntil).getTime() <= new Date(showFrom).getTime()) {
      redirectWithMessage("Bitis tarihi baslangic tarihinden sonra olmali.", "error");
    }

    if (targetMode === "profile" && targetProfileIds.length === 0) {
      redirectWithMessage("Kisi bazli gonderim icin en az bir kullanici secmelisiniz.", "error");
    }

    const admin = createAdminClient();
    const { data: existingAnnouncement, error: existingError } = await admin
      .from("popup_announcements")
      .select("id, image_path")
      .eq("id", id)
      .single();

    if (existingError || !existingAnnouncement) {
      redirectWithMessage("Duzenlenecek bildirim bulunamadi.", "error");
    }

    const uploadedImagePath = imageFile instanceof File ? await uploadPopupAnnouncementImage(imageFile) : null;
    const nextImagePath = removeImage
      ? null
      : uploadedImagePath && uploadedImagePath.length > 0
        ? uploadedImagePath
        : existingAnnouncement.image_path;

    const updatePayload = {
      title,
      body,
      link_url: linkUrl,
      image_path: nextImagePath,
      target_mode: targetMode,
      target_roles: targetMode === "role" ? targetRoles : [],
      target_profile_ids: targetMode === "profile" ? targetProfileIds : [],
      show_from: showFrom,
      show_until: showUntil,
      updated_at: new Date().toISOString()
    };

    let { data: updatedAnnouncement, error } = await admin
      .from("popup_announcements")
      .update(updatePayload)
      .eq("id", id)
      .select("id, title")
      .single();

    if (error && isPopupTargetSchemaMissingError(error.message)) {
      if (targetMode === "profile") {
        redirectWithMessage(
          "Kisi bazli popup guncellemesi icin once popup announcement SQL guncellemesini uygulamaniz gerekir.",
          "error"
        );
      }

      const fallback = await admin
        .from("popup_announcements")
        .update({
          title,
          body,
          link_url: linkUrl,
          image_path: nextImagePath,
          target_roles: targetRoles,
          show_from: showFrom,
          show_until: showUntil,
          updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select("id, title")
        .single();

      updatedAnnouncement = fallback.data;
      error = fallback.error;
    }

    if (error) {
      redirectWithMessage(`Bildirim guncellenemedi: ${error.message}`, "error");
    }

    if (!updatedAnnouncement || updatedAnnouncement.title !== title) {
      redirectWithMessage("Popup konusu guncellenemedi. Lutfen tekrar deneyin.", "error");
    }

    if (
      existingAnnouncement.image_path &&
      existingAnnouncement.image_path !== nextImagePath &&
      !existingAnnouncement.image_path.startsWith("data:")
    ) {
      await admin.storage.from(POPUP_ANNOUNCEMENT_BUCKET).remove([existingAnnouncement.image_path]);
    }

    revalidatePath("/");
    revalidatePath("/admin/bildirimler");
    redirectWithMessage("Popup bildirimin konusu ve icerigi guncellendi.");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Popup bildirim guncellenemedi. Lutfen tekrar deneyin.";

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

export async function updateAutoPopupSettingAction(formData: FormData) {
  await requireAdminAccess();

  const notificationKey = String(formData.get("notificationKey") ?? "").trim();
  const defaultSetting = autoPopupSettingDefaults.find((item) => item.key === notificationKey);

  if (!defaultSetting) {
    redirectWithMessage("Otomatik bildirim ayari bulunamadi.", "error");
  }

  const isActive = String(formData.get("isActive") ?? "") === "true";
  const targetRoles = parseAutoPopupTargetRoles(formData);
  const admin = createAdminClient();

  const { error } = await admin.from("auto_popup_notification_settings").upsert(
    {
      notification_key: defaultSetting.key,
      label: defaultSetting.label,
      description: defaultSetting.description,
      is_active: isActive,
      target_roles: targetRoles,
      updated_at: new Date().toISOString()
    },
    { onConflict: "notification_key" }
  );

  if (error) {
    redirectWithMessage(`Otomatik popup ayari guncellenemedi: ${error.message}`, "error");
  }

  revalidatePath("/");
  revalidatePath("/admin/bildirimler");
  redirectWithMessage("Otomatik popup ayari guncellendi.");
}
