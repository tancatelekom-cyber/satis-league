import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { APP_SESSION_COOKIE, APP_SESSION_DURATION_SECONDS, createAppSessionValue } from "@/lib/auth/app-session";
import { buildNextLoginMetadata } from "@/lib/auth/login-tracking";
import { getSupabasePublicEnv } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";

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

  let redirectTo = "/";

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(user.id);

    if (error) {
      console.error("Login count user could not be loaded", error);
    } else if (data.user) {
      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: buildNextLoginMetadata(data.user.app_metadata)
      });

      if (updateError) console.error("Login count could not be updated", updateError);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Login redirect profile could not be loaded", profileError);
    } else if (profile?.role === "manager") {
      redirectTo = "/hedef-gerceklesen?view=store&panel=detail";
    } else if (profile?.role === "management" || profile?.role === "admin") {
      redirectTo = "/hedef-gerceklesen?view=company&panel=detail";
    }
  } catch (error) {
    console.error("Login count tracking failed", error);
  }

  const response = NextResponse.json({ ok: true, redirectTo });
  response.cookies.set(APP_SESSION_COOKIE, createAppSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: APP_SESSION_DURATION_SECONDS
  });

  return response;
}
