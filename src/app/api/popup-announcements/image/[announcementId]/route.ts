import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { POPUP_ANNOUNCEMENT_BUCKET } from "@/lib/popup-announcements";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      announcementId: string;
    }>;
  }
) {
  const { announcementId } = await context.params;
  const safeAnnouncementId = announcementId.trim();

  if (!safeAnnouncementId) {
    return NextResponse.json({ error: "Bildirim bulunamadi." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Giris gerekli." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: announcement, error: announcementError } = await admin
    .from("popup_announcements")
    .select("image_path")
    .eq("id", safeAnnouncementId)
    .maybeSingle();

  if (announcementError || !announcement?.image_path) {
    return NextResponse.json({ error: "Gorsel bulunamadi." }, { status: 404 });
  }

  const { data, error } = await admin.storage.from(POPUP_ANNOUNCEMENT_BUCKET).download(announcement.image_path);

  if (error || !data) {
    return NextResponse.json({ error: "Gorsel okunamadi." }, { status: 404 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());

  return new NextResponse(buffer, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": 'inline; filename="popup-image"',
      "Content-Length": String(buffer.byteLength),
      "Content-Type": data.type || "image/jpeg",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
