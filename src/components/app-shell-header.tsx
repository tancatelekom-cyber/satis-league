"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { createClient } from "@/lib/supabase/browser";
import { UserRole } from "@/lib/types";

type HeaderProfile = {
  role: UserRole;
  approval: "pending" | "approved" | "rejected";
};

type NavItem = {
  href: string;
  label: string;
};

export function AppShellHeader() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [profile, setProfile] = useState<HeaderProfile | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setLoggedIn(false);
        setProfile(null);
        setReady(true);
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("role, approval")
        .eq("id", user.id)
        .single();

      setLoggedIn(true);
      setProfile((profileData as HeaderProfile | null) ?? null);
      setReady(true);
    }

    void load();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname]);

  const isAuthPage = pathname === "/giris" || pathname === "/kayit";

  const navItems = useMemo<NavItem[]>(() => {
    if (!ready) {
      return [];
    }

    if (!loggedIn) {
      return [
        { href: "/", label: "Ana Sayfa" },
        { href: "/kayit", label: "Kayit" },
        { href: "/giris", label: "Giris" }
      ];
    }

    if (!profile || profile.approval !== "approved") {
      return [
        { href: "/", label: "Ana Sayfa" },
        { href: "/hesabim", label: "Durumum" }
      ];
    }

    const commonApproved: NavItem[] = [
      { href: "/kampanyalar", label: "Kampanyalar" },
      { href: "/bildirimler", label: "Bildirimler" },
      { href: "/lig", label: "Sezon Ligi" },
      { href: "/hesabim", label: "Hesabim" }
    ];

    if (profile.role === "employee") {
      return commonApproved;
    }

    if (profile.role === "manager") {
      return [...commonApproved, { href: "/magaza-vs-magaza", label: "Magaza VS" }];
    }

    if (profile.role === "management") {
      return [...commonApproved, { href: "/magaza-vs-magaza", label: "Magaza VS" }];
    }

    return [
      { href: "/kampanyalar", label: "Kampanyalar" },
      { href: "/lig", label: "Sezon Ligi" },
      { href: "/magaza-vs-magaza", label: "Magaza VS" },
      { href: "/bildirimler", label: "Bildirimler" },
      { href: "/admin", label: "Admin" },
      { href: "/kontrol-listesi", label: "Kontrol" },
      { href: "/hesabim", label: "Hesabim" }
    ];
  }, [loggedIn, profile, ready]);

  return (
    <header className={`topbar ${isAuthPage ? "topbar-auth" : "topbar-app"}`}>
      <Link className="brand" href={loggedIn ? "/kampanyalar" : "/"}>
        <div className="brand-badge">S+</div>
        <div>
          <div>TANCA SATIS LEAGUE</div>
          <small className="subtle">{isAuthPage ? "Hesabiniza giris" : "Satis motivasyon uygulamasi"}</small>
        </div>
      </Link>

      {!isAuthPage ? (
        <div className="nav-cluster">
          {navItems.length ? (
            <nav className="nav-links">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  className={`nav-link ${pathname === item.href ? "nav-link-active" : ""}`}
                  href={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}

          {loggedIn ? <LogoutButton /> : null}
        </div>
      ) : null}
    </header>
  );
}
