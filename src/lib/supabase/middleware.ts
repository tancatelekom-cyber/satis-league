import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

const PUBLIC_ROUTES = new Set([
  "/giris",
  "/kayit",
  "/sifremi-unuttum",
  "/sifre-yenile"
]);
const APP_SESSION_COOKIE = "tanca_session";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request
  });
  const env = getSupabasePublicEnv();

  if (!env) {
    return response;
  }

  type CookieInput = {
    name: string;
    value: string;
    options?: Parameters<typeof response.cookies.set>[2];
  };

  const supabase = createServerClient(
    env.url,
    env.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieInput[]) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);
  const hasAppSession = request.cookies.get(APP_SESSION_COOKIE)?.value === "active";

  if ((!user || !hasAppSession) && !isPublicRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/giris";
    if (pathname !== "/") {
      redirectUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(redirectUrl);
  }

  if (user && hasAppSession && isPublicRoute && pathname !== "/sifre-yenile") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
