"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type NavItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  icon?: string;
};

const baseNavItems: NavItem[] = [
  { href: "/", label: "Ana Sayfa" },
  { href: "/kampanyalar", label: "Gunluk Kampanyalar", mobileLabel: "Kampanya", icon: "⚡" },
  { href: "/lig", label: "Yildizlar Kulubu", mobileLabel: "Lig", icon: "⭐" },
  { href: "/tarifeler", label: "Tarifeler", mobileLabel: "Tarife", icon: "📶" },
  { href: "/cihaz-fiyat-listesi", label: "Cihaz Fiyat Listesi", mobileLabel: "Cihaz", icon: "📱" },
  { href: "/hesabim", label: "Hesabim", mobileLabel: "Hesap", icon: "👤" }
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShellHeader() {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadRole() {
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!user || !active) {
          if (active) {
            setIsAdmin(false);
          }
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, approval")
          .eq("id", user.id)
          .single();

        if (active) {
          setIsAdmin(profile?.role === "admin" && profile?.approval === "approved");
        }
      } catch {
        if (active) {
          setIsAdmin(false);
        }
      }
    }

    loadRole();

    return () => {
      active = false;
    };
  }, []);

  const navItems = useMemo(
    () =>
      isAdmin
        ? [...baseNavItems, { href: "/admin", label: "Admin Paneli", mobileLabel: "Admin", icon: "🛠" }]
        : baseNavItems,
    [isAdmin]
  );

  const primaryTabs = useMemo(() => {
    // Mobile tabbar only has room for 4; keep the most-used user flows.
    const wanted = ["/kampanyalar", "/lig", "/tarifeler", "/cihaz-fiyat-listesi"];
    return navItems.filter((item) => wanted.includes(item.href));
  }, [navItems]);

  return (
    <>
      <header className="topbar topbar-app">
        <Link className="brand" href="/" onClick={() => setMenuOpen(false)}>
          <span className="brand-badge">T+</span>
          <span>TANCA+</span>
        </Link>

        <div className={`nav-cluster ${menuOpen ? "nav-cluster-open" : ""}`}>
          <button className="menu-toggle" type="button" onClick={() => setMenuOpen((v) => !v)}>
            Menu
          </button>

          <nav className="nav-links" aria-label="Uygulama menusu">
            {navItems.map((item) => (
              <Link
                key={item.href}
                className={`nav-link ${isActive(pathname, item.href) ? "nav-link-active" : ""}`}
                href={item.href}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <nav className="mobile-tabbar" aria-label="Hizli menu">
        {primaryTabs.map((item) => (
          <Link
            key={item.href}
            className={`mobile-tab ${isActive(pathname, item.href) ? "mobile-tab-active" : ""}`}
            href={item.href}
          >
            <span className="mobile-tab-icon" aria-hidden="true">
              {item.icon ?? "•"}
            </span>
            <span className="mobile-tab-label">{item.mobileLabel ?? item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
