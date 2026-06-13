import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { POPUP_ANNOUNCEMENT_BUCKET } from "@/lib/popup-announcements";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imagePath = String(searchParams.get("path") ?? "").trim();

  if (!imagePath) {
    return NextResponse.json({ error: "Gorsel yolu eksik." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Giris gerekli." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(POPUP_ANNOUNCEMENT_BUCKET).download(imagePath);

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
