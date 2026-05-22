"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function dismissPopupAnnouncementAction(announcementId: string) {
  const safeAnnouncementId = announcementId.trim();

  if (!safeAnnouncementId) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const admin = createAdminClient();

  await admin.from("popup_announcement_dismissals").upsert(
    {
      announcement_id: safeAnnouncementId,
      profile_id: user.id
    },
    {
      onConflict: "announcement_id,profile_id"
    }
  );

  revalidatePath("/");
}
