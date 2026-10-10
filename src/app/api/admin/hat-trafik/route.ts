import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ message: "Oturum açmanız gerekiyor." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role, approval").eq("id", user.id).single();
  if (profile?.role !== "admin" || profile.approval !== "approved") {
    return Response.json({ message: "Admin yetkisi gerekiyor." }, { status: 403 });
  }
  // Fresh random bytes prevent compression from reducing the requested traffic.
  const bytes = new Uint8Array(randomBytes(2_000_000));
  return new Response(bytes, { headers: {
    "Content-Type": "application/octet-stream",
    "Content-Length": String(bytes.byteLength),
    "Cache-Control": "private, no-store, no-transform",
    "X-Content-Type-Options": "nosniff"
  } });
}
