"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
export async function updateRevenueExpenseUserPermissionAction(form:FormData) {
  await requireAdminAccess();let message="Görüntüleme yetkisi güncellendi.",type="success";
  try {
    const id=String(form.get("profileId")??""),mode=String(form.get("mode")??"");
    if(!["allow","deny"].includes(mode))throw new Error("Geçersiz izin.");
    const admin=createAdminClient();const {data:profile,error:profileError}=await admin.from("profiles").select("id").eq("id",id).eq("approval","approved").single();
    if(profileError||!profile)throw new Error("Onaylı kullanıcı bulunamadı.");
    const {error}=await admin.from("feature_profile_permissions").upsert({feature_key:"gelir-gider",profile_id:id,is_allowed:mode==="allow",updated_at:new Date().toISOString()},{onConflict:"feature_key,profile_id"});
    if(error)throw new Error("Yetki kaydedilemedi.");
    revalidatePath("/","layout");revalidatePath("/gelir-gider");revalidatePath("/admin/gelir-gider");
  }catch(error){type="error";message=error instanceof Error?error.message:"İşlem tamamlanamadı.";}
  redirect("/admin/gelir-gider?"+new URLSearchParams({message,type}));
}
