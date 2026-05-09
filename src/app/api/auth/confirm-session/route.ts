import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const APP_SESSION_COOKIE = "tanca_session";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(APP_SESSION_COOKIE, "active", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/"
  });

  return response;
}
