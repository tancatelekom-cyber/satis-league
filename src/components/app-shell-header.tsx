"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

type NavItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  icon?: string;
};

const baseNavItems: NavItem[] = [
  { href: "/", label: "Ana Sayfa" },
  { href: "/kampanyalar", label: "Gunluk Kampanyalar", mobileLabel: "Kampanya", icon: "K" },
  { href: "/aylik-kampanyalar", label: "Aylik Kampanyalar", mobileLabel: "Aylik", icon: "A" },
  { href: "/lig", label: "Yildizlar Kulubu", mobileLabel: "Lig", icon: "L" },
  { href: "/hedef-gerceklesen", label: "Hedef Gerceklesen", mobileLabel: "Hedef", icon: "H" },
  { href: "/tarifeler", label: "Tarifeler", mobileLabel: "Tarife", icon: "T" },
  { href: "/cihaz-fiyat-listesi", label: "Cihaz Fiyat Listesi", mobileLabel: "Cihaz", icon: "C" },
  { href: "/stok-bilgisi", label: "Stok Bilgisi", mobileLabel: "Stok", icon: "S" },
  { href: "/hesabim", label: "Hesabim", mobileLabel: "Hesap", icon: "P" }
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type AppShellHeaderProps = {
  initialIsAdmin?: boolean;
  initialCanEvaluate?: boolean;
  initialCanOpenEvaluationPresentation?: boolean;
};

export function AppShellHeader({
  initialIsAdmin = false,
  initialCanEvaluate = false,
  initialCanOpenEvaluationPresentation = false
}: AppShellHeaderProps) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = useMemo(() => {
    const items = false && initialCanEvaluate
      ? [...baseNavItems, { href: "/degerlendirme", label: "Degerlendirme", mobileLabel: "Deger", icon: "D" }]
      : baseNavItems;

    const itemsWithPresentation = initialCanOpenEvaluationPresentation
      ? [...items, { href: "/degerlendirme-sunumu", label: "Degerlendirme Sunumu", mobileLabel: "Sunum", icon: "U" }]
      : items;

    return initialIsAdmin
      ? [...itemsWithPresentation, { href: "/admin", label: "Admin Paneli", mobileLabel: "Admin", icon: "Y" }]
      : itemsWithPresentation;
  }, [initialCanEvaluate, initialCanOpenEvaluationPresentation, initialIsAdmin]);

  const primaryTabs = useMemo(() => {
    const wanted = [
      "/kampanyalar",
      "/aylik-kampanyalar",
      "/lig",
      "/hedef-gerceklesen",
      "/tarifeler",
      "/cihaz-fiyat-listesi"
    ];
    return navItems.filter((item) => wanted.includes(item.href));
  }, [navItems]);

  return (
    <>
      <header className="topbar topbar-app">
        <Link className="brand" href="/" onClick={() => setMenuOpen(false)}>
          <span className="brand-badge">
            <Image src="/tplus-logo.png" alt="TANCA+ logo" width={60} height={60} className="brand-logo-image" priority />
          </span>
          <span>TANCA+</span>
        </Link>

        <div className={`nav-cluster ${menuOpen ? "nav-cluster-open" : ""}`}>
          <button className="menu-toggle" type="button" onClick={() => setMenuOpen((value) => !value)}>
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
              {item.icon ?? "."}
            </span>
            <span className="mobile-tab-label">{item.mobileLabel ?? item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
