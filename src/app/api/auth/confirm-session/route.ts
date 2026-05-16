import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

const APP_SESSION_COOKIE = "tanca_session";

export async function POST(request: Request) {
  let accessToken = "";

  try {
    const body = (await request.json()) as { accessToken?: string };
    accessToken = body.accessToken?.trim() ?? "";
  } catch {
    accessToken = "";
  }

  let user = null;

  if (accessToken) {
    const env = getSupabasePublicEnv();

    if (env) {
      const tokenClient = createSupabaseClient(env.url, env.anonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

      const {
        data: { user: tokenUser }
      } = await tokenClient.auth.getUser(accessToken);

      user = tokenUser;
    }
  }

  if (!user) {
    const supabase = await createClient();
    const {
      data: { user: cookieUser }
    } = await supabase.auth.getUser();

    user = cookieUser;
  }

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
