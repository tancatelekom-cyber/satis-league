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

function getMobileNavMeta(href: string, label: string) {
  switch (href) {
    case "/kampanyalar":
      return { icon: "◉", shortLabel: "Bugun" };
    case "/tarifeler":
      return { icon: "◈", shortLabel: "Tarife" };
    case "/lig":
      return { icon: "★", shortLabel: "Yildiz" };
    case "/bildirimler":
      return { icon: "◎", shortLabel: "Bildirim" };
    case "/admin":
      return { icon: "▣", shortLabel: "Admin" };
    case "/hesabim":
      return { icon: "◍", shortLabel: "Hesap" };
    default:
      return { icon: "•", shortLabel: label };
  }
}

export function AppShellHeader() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [profile, setProfile] = useState<HeaderProfile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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

  useEffect(() => {
    setMenuOpen(false);
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
      { href: "/kampanyalar", label: "Gunluk Kampanyalar" },
      { href: "/tarifeler", label: "Tarifeler" },
      { href: "/bildirimler", label: "Bildirimler" },
      { href: "/lig", label: "Yildizlar Kulubu" },
      { href: "/hesabim", label: "Hesabim" }
    ];

    if (profile.role === "employee" || profile.role === "manager" || profile.role === "management") {
      return commonApproved;
    }

    return [
      { href: "/kampanyalar", label: "Gunluk Kampanyalar" },
      { href: "/tarifeler", label: "Tarifeler" },
      { href: "/lig", label: "Yildizlar Kulubu" },
      { href: "/bildirimler", label: "Bildirimler" },
      { href: "/admin", label: "Admin" },
      { href: "/hesabim", label: "Hesabim" }
    ];
  }, [loggedIn, profile, ready]);

  const mobilePrimaryNav = useMemo(() => navItems.slice(0, 4), [navItems]);

  return (
    <header className={`topbar ${isAuthPage ? "topbar-auth" : "topbar-app"}`}>
      <Link className="brand" href={loggedIn ? "/kampanyalar" : "/"}>
        <div className="brand-badge">T+</div>
        <div>
          <div>TANCA SUPER LIG</div>
          {isAuthPage ? <small className="subtle">Hesabiniza giris</small> : null}
        </div>
      </Link>

      {!isAuthPage ? (
        <>
          <div className={`nav-cluster ${menuOpen ? "nav-cluster-open" : ""}`}>
            <button
              aria-expanded={menuOpen}
              aria-label="Menuyu ac veya kapat"
              className="menu-toggle"
              onClick={() => setMenuOpen((current) => !current)}
              type="button"
            >
              {menuOpen ? "Kapat" : "Menu"}
            </button>

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

          {mobilePrimaryNav.length ? (
            <nav className="mobile-tabbar">
              {mobilePrimaryNav.map((item) => {
                const meta = getMobileNavMeta(item.href, item.label);

                return (
                  <Link
                    key={item.href}
                    className={`mobile-tab ${pathname === item.href ? "mobile-tab-active" : ""}`}
                    href={item.href}
                  >
                    <span aria-hidden="true" className="mobile-tab-icon">
                      {meta.icon}
                    </span>
                    <span className="mobile-tab-label">{meta.shortLabel}</span>
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </>
      ) : null}
    </header>
  );
}
