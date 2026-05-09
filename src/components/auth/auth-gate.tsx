"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const PUBLIC_ROUTES = new Set([
  "/giris",
  "/kayit",
  "/sifremi-unuttum",
  "/sifre-yenile"
]);

export function AuthGate({
  children
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState(false);

  const isPublicRoute = useMemo(() => PUBLIC_ROUTES.has(pathname), [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function checkUser() {
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (cancelled) {
          return;
        }

        if (!user && !isPublicRoute) {
          const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
          router.replace(`/giris${next}`);
          return;
        }

        setIsAllowed(true);
      } catch {
        if (!cancelled) {
          if (isPublicRoute) {
            setIsAllowed(true);
          } else {
            router.replace("/giris");
          }
        }
      }
    }

    setIsAllowed(false);
    void checkUser();

    return () => {
      cancelled = true;
    };
  }, [isPublicRoute, pathname, router]);

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
}
