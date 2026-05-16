"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { MONTHLY_CAMPAIGN_BUCKET } from "@/lib/monthly-campaigns";
import { createAdminClient } from "@/lib/supabase/admin";

const REDIRECT_PATH = "/admin/aylik-kampanyalar";

function redirectWithMessage(message: string, type: "success" | "error" = "success") {
  const params = new URLSearchParams({ message, type });
  redirect(`${REDIRECT_PATH}?${params.toString()}`);
}

function sanitizeFileName(fileName: string) {
  const name = fileName.replace(/\.[^.]+$/, "").trim() || "aylik-kampanya";
  return name
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function getExtension(fileName: string, mimeType: string) {
  const fromName = fileName.split(".").pop()?.trim().toLowerCase();
  if (fromName) {
    return fromName;
  }

  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

async function uploadMonthlyCampaignImage(file: File, userId: string) {
  if (!file || file.size === 0) {
    throw new Error("Lutfen bir resim secin.");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Sadece resim yukleyebilirsiniz.");
  }

  const extension = getExtension(file.name, file.type);
  const safeName = sanitizeFileName(file.name);
  const imagePath = `${userId}/${Date.now()}-${crypto.randomUUID()}-${safeName}.${extension}`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const admin = createAdminClient();
  const { error } = await admin.storage.from(MONTHLY_CAMPAIGN_BUCKET).upload(imagePath, fileBuffer, {
    contentType: file.type,
    upsert: false
  });

  if (error) {
    throw new Error(`Resim yuklenemedi: ${error.message}`);
  }

  return {
    imagePath,
    title: file.name.replace(/\.[^.]+$/, "").trim() || "Aylik Kampanya"
  };
}

function revalidateMonthlyCampaignPages() {
  revalidatePath("/aylik-kampanyalar");
  revalidatePath("/admin");
  revalidatePath("/admin/aylik-kampanyalar");
}

export async function uploadMonthlyCampaignSlideAction(formData: FormData) {
  const { user } = await requireAdminAccess();

  try {
    const file = formData.get("image");

    if (!(file instanceof File)) {
      throw new Error("Resim secilemedi.");
    }

    const admin = createAdminClient();
    const { data: lastSlide } = await admin
      .from("monthly_campaign_slides")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const upload = await uploadMonthlyCampaignImage(file, user.id);
    const { error } = await admin.from("monthly_campaign_slides").insert({
      title: upload.title,
      image_path: upload.imagePath,
      sort_order: Number(lastSlide?.sort_order ?? -1) + 1,
      created_by: user.id
    });

    if (error) {
      await admin.storage.from(MONTHLY_CAMPAIGN_BUCKET).remove([upload.imagePath]);
      throw new Error(`Kayit olusturulamadi: ${error.message}`);
    }

    revalidateMonthlyCampaignPages();
    redirectWithMessage("Aylik kampanya resmi yuklendi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Resim yuklenemedi.", "error");
  }
}

export async function replaceMonthlyCampaignSlideAction(formData: FormData) {
  await requireAdminAccess();

  try {
    const slideId = String(formData.get("slideId") ?? "").trim();
    const file = formData.get("image");

    if (!slideId) {
      throw new Error("Degistirilecek gorsel bulunamadi.");
    }

    if (!(file instanceof File)) {
      throw new Error("Yeni resim secilemedi.");
    }

    const admin = createAdminClient();
    const { data: slide, error: slideError } = await admin
      .from("monthly_campaign_slides")
      .select("id, image_path")
      .eq("id", slideId)
      .single();

    if (slideError || !slide) {
      throw new Error("Gorsel kaydi bulunamadi.");
    }

    const upload = await uploadMonthlyCampaignImage(file, "admin");
    const { error: updateError } = await admin
      .from("monthly_campaign_slides")
      .update({
        title: upload.title,
        image_path: upload.imagePath,
        updated_at: new Date().toISOString()
      })
      .eq("id", slideId);

    if (updateError) {
      await admin.storage.from(MONTHLY_CAMPAIGN_BUCKET).remove([upload.imagePath]);
      throw new Error(`Gorsel guncellenemedi: ${updateError.message}`);
    }

    await admin.storage.from(MONTHLY_CAMPAIGN_BUCKET).remove([slide.image_path]);

    revalidateMonthlyCampaignPages();
    redirectWithMessage("Aylik kampanya gorseli degistirildi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Gorsel degistirilemedi.", "error");
  }
}

export async function deleteMonthlyCampaignSlideAction(formData: FormData) {
  await requireAdminAccess();

  try {
    const slideId = String(formData.get("slideId") ?? "").trim();

    if (!slideId) {
      throw new Error("Silinecek gorsel bulunamadi.");
    }

    const admin = createAdminClient();
    const { data: slide, error: slideError } = await admin
      .from("monthly_campaign_slides")
      .select("id, image_path")
      .eq("id", slideId)
      .single();

    if (slideError || !slide) {
      throw new Error("Gorsel kaydi bulunamadi.");
    }

    const { error: deleteError } = await admin.from("monthly_campaign_slides").delete().eq("id", slideId);

    if (deleteError) {
      throw new Error(`Gorsel silinemedi: ${deleteError.message}`);
    }

    await admin.storage.from(MONTHLY_CAMPAIGN_BUCKET).remove([slide.image_path]);

    revalidateMonthlyCampaignPages();
    redirectWithMessage("Aylik kampanya gorseli silindi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Gorsel silinemedi.", "error");
  }
}
