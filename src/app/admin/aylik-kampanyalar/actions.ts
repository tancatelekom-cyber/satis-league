"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import {
  MONTHLY_CAMPAIGN_BUCKET,
  MONTHLY_CAMPAIGN_TYPES,
  type MonthlyCampaignType
} from "@/lib/monthly-campaigns";
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

function getCampaignTitle(formData: FormData) {
  const title = String(formData.get("title") ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);

  if (!title) {
    throw new Error("Lutfen kampanya adini girin.");
  }

  return title;
}

function getCampaignType(formData: FormData): MonthlyCampaignType {
  const campaignType = String(formData.get("campaignType") ?? "")
    .trim()
    .toLowerCase() as MonthlyCampaignType;

  if (!MONTHLY_CAMPAIGN_TYPES.includes(campaignType)) {
    throw new Error("Lutfen kampanya alanini secin.");
  }

  return campaignType;
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

  return imagePath;
}

function revalidateMonthlyCampaignPages() {
  revalidatePath("/aylik-kampanyalar");
  revalidatePath("/admin");
  revalidatePath("/admin/aylik-kampanyalar");
}

async function getOrderedMonthlyCampaignSlides(campaignType: MonthlyCampaignType) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("monthly_campaign_slides")
    .select("id, sort_order, created_at")
    .eq("campaign_type", campaignType)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Gorsel sirasi okunamadi: ${error.message}`);
  }

  return (data ?? []) as Array<{
    id: string;
    sort_order: number;
    created_at: string;
  }>;
}

async function applyMonthlyCampaignSortOrder(slideIds: string[]) {
  const admin = createAdminClient();

  await Promise.all(
    slideIds.map((slideId, index) =>
      admin
        .from("monthly_campaign_slides")
        .update({
          sort_order: index,
          updated_at: new Date().toISOString()
        })
        .eq("id", slideId)
    )
  );
}

export async function uploadMonthlyCampaignSlideAction(formData: FormData) {
  const { user } = await requireAdminAccess();

  try {
    const file = formData.get("image");
    const title = getCampaignTitle(formData);
    const campaignType = getCampaignType(formData);

    if (!(file instanceof File)) {
      throw new Error("Resim secilemedi.");
    }

    const admin = createAdminClient();
    const { data: lastSlide } = await admin
      .from("monthly_campaign_slides")
      .select("sort_order")
      .eq("campaign_type", campaignType)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const imagePath = await uploadMonthlyCampaignImage(file, user.id);
    const { error } = await admin.from("monthly_campaign_slides").insert({
      title,
      campaign_type: campaignType,
      image_path: imagePath,
      sort_order: Number(lastSlide?.sort_order ?? -1) + 1,
      created_by: user.id
    });

    if (error) {
      await admin.storage.from(MONTHLY_CAMPAIGN_BUCKET).remove([imagePath]);
      throw new Error(`Kayit olusturulamadi: ${error.message}`);
    }

    revalidateMonthlyCampaignPages();
    redirectWithMessage("Kampanya eklendi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Resim yuklenemedi.", "error");
  }
}

export async function replaceMonthlyCampaignSlideAction(formData: FormData) {
  await requireAdminAccess();

  try {
    const slideId = String(formData.get("slideId") ?? "").trim();
    const file = formData.get("image");
    const title = getCampaignTitle(formData);
    const campaignType = getCampaignType(formData);

    if (!slideId) {
      throw new Error("Degistirilecek gorsel bulunamadi.");
    }

    if (!(file instanceof File)) {
      throw new Error("Yeni resim secilemedi.");
    }

    const admin = createAdminClient();
    const { data: slide, error: slideError } = await admin
      .from("monthly_campaign_slides")
      .select("id, image_path, campaign_type, sort_order")
      .eq("id", slideId)
      .single();

    if (slideError || !slide) {
      throw new Error("Gorsel kaydi bulunamadi.");
    }

    const imagePath = await uploadMonthlyCampaignImage(file, "admin");
    let sortOrder = Number(slide.sort_order ?? 0);

    if (slide.campaign_type !== campaignType) {
      const { data: lastSlide } = await admin
        .from("monthly_campaign_slides")
        .select("sort_order")
        .eq("campaign_type", campaignType)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      sortOrder = Number(lastSlide?.sort_order ?? -1) + 1;
    }

    const { error: updateError } = await admin
      .from("monthly_campaign_slides")
      .update({
        title,
        campaign_type: campaignType,
        image_path: imagePath,
        sort_order: sortOrder,
        updated_at: new Date().toISOString()
      })
      .eq("id", slideId);

    if (updateError) {
      await admin.storage.from(MONTHLY_CAMPAIGN_BUCKET).remove([imagePath]);
      throw new Error(`Gorsel guncellenemedi: ${updateError.message}`);
    }

    await admin.storage.from(MONTHLY_CAMPAIGN_BUCKET).remove([slide.image_path]);

    if (slide.campaign_type !== campaignType) {
      const oldCampaignType = slide.campaign_type as MonthlyCampaignType;
      const oldGroupSlides = await getOrderedMonthlyCampaignSlides(oldCampaignType);
      await applyMonthlyCampaignSortOrder(oldGroupSlides.map((item) => item.id));
    }

    revalidateMonthlyCampaignPages();
    redirectWithMessage("Kampanya guncellendi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Gorsel degistirilemedi.", "error");
  }
}

export async function moveMonthlyCampaignSlideAction(formData: FormData) {
  await requireAdminAccess();

  try {
    const slideId = String(formData.get("slideId") ?? "").trim();
    const direction = String(formData.get("direction") ?? "").trim();

    if (!slideId || !["up", "down"].includes(direction)) {
      throw new Error("Tasima bilgisi eksik.");
    }

    const admin = createAdminClient();
    const { data: currentSlide, error: slideError } = await admin
      .from("monthly_campaign_slides")
      .select("campaign_type")
      .eq("id", slideId)
      .single();

    if (slideError || !currentSlide) {
      throw new Error("Gorsel kaydi bulunamadi.");
    }

    const orderedSlides = await getOrderedMonthlyCampaignSlides(
      currentSlide.campaign_type as MonthlyCampaignType
    );
    const currentIndex = orderedSlides.findIndex((slide) => slide.id === slideId);

    if (currentIndex < 0) {
      throw new Error("Gorsel kaydi bulunamadi.");
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= orderedSlides.length) {
      revalidateMonthlyCampaignPages();
      redirectWithMessage("Gorsel zaten sinirda.");
    }

    const reorderedSlideIds = orderedSlides.map((slide) => slide.id);
    const [movedSlideId] = reorderedSlideIds.splice(currentIndex, 1);
    reorderedSlideIds.splice(targetIndex, 0, movedSlideId);

    await applyMonthlyCampaignSortOrder(reorderedSlideIds);

    revalidateMonthlyCampaignPages();
    redirectWithMessage("Gorsel sirasi guncellendi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Gorsel sirasi guncellenemedi.", "error");
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
      .select("id, image_path, campaign_type")
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
    const orderedSlides = await getOrderedMonthlyCampaignSlides(
      slide.campaign_type as MonthlyCampaignType
    );
    await applyMonthlyCampaignSortOrder(orderedSlides.map((item) => item.id));

    revalidateMonthlyCampaignPages();
    redirectWithMessage("Aylik kampanya gorseli silindi.");
  } catch (error) {
    redirectWithMessage(error instanceof Error ? error.message : "Gorsel silinemedi.", "error");
  }
}
