"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { withAuthTimeout } from "@/lib/auth/with-auth-timeout";

const PUBLIC_ROUTES = new Set(["/giris", "/kayit", "/sifremi-unuttum", "/sifre-yenile"]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);
  const [allowedPath, setAllowedPath] = useState<string | null>(null);
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (isPublicRoute) return;
    let cancelled = false;
    setAllowedPath(null);
    setFailedPath(null);
    async function checkUser() {
      try {
        const supabase = createClient();
        const { data: { user }, error } = await withAuthTimeout(supabase.auth.getUser());
        if (cancelled) return;
        if (error) throw error;
        if (!user) {
          const next = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
          router.replace(`/giris${next}`);
          return;
        }
        setAllowedPath(pathname);
      } catch {
        if (!cancelled) setFailedPath(pathname);
      }
    }
    void checkUser();
    return () => { cancelled = true; };
  }, [isPublicRoute, pathname, router, attempt]);

  if (isPublicRoute || allowedPath === pathname) return <>{children}</>;
  const failed = failedPath === pathname;
  return (
    <main aria-busy={!failed}>
      <section className="guide-card" role="status">
        <h1>{failed ? "Oturum kontrolü tamamlanamadı" : "Oturumunuz kontrol ediliyor…"}</h1>
        <p>{failed ? "Bağlantınızı kontrol edip tekrar deneyin. Sorun devam ederse yeniden giriş yapabilirsiniz." : "Lütfen bekleyin."}</p>
        {failed ? <div className="action-row">
          <button type="button" className="button-primary" onClick={() => { setFailedPath(null); setAttempt(value => value + 1); }}>Tekrar dene</button>
          <a className="button-secondary" href="/giris">Giriş sayfası</a>
        </div> : null}
      </section>
    </main>
  );
}
