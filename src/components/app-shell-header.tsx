"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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

function MobileTabIcon({ kind }: { kind?: string }) {
  const sharedProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "mobile-tab-icon-svg",
    "aria-hidden": "true" as const
  };

  const icons: Record<string, ReactNode> = {
    K: (
      <svg {...sharedProps}>
        <path d="M5 7h14" />
        <path d="M7 12h10" />
        <path d="M9 17h6" />
      </svg>
    ),
    A: (
      <svg {...sharedProps}>
        <rect x="5" y="4.5" width="14" height="15" rx="2.5" />
        <path d="M8 8h8" />
        <path d="M8 12h8" />
        <path d="M8 16h5" />
      </svg>
    ),
    L: (
      <svg {...sharedProps}>
        <path d="M6 18V10" />
        <path d="M12 18V6" />
        <path d="M18 18v-4" />
      </svg>
    ),
    H: (
      <svg {...sharedProps}>
        <path d="M4.5 12h15" />
        <path d="M12 4.5v15" />
        <circle cx="12" cy="12" r="7.5" />
      </svg>
    ),
    T: (
      <svg {...sharedProps}>
        <path d="M4.5 7.5h15" />
        <path d="M12 7.5v10" />
        <path d="M8 18h8" />
      </svg>
    ),
    C: (
      <svg {...sharedProps}>
        <rect x="6" y="4.5" width="12" height="15" rx="2.5" />
        <path d="M9 7.5h6" />
        <path d="M10 16.5h4" />
      </svg>
    ),
    S: (
      <svg {...sharedProps}>
        <path d="M6 7h12" />
        <path d="M7.5 7v10" />
        <path d="M16.5 7v10" />
        <path d="M6 12h12" />
        <path d="M9.5 17h5" />
      </svg>
    ),
    P: (
      <svg {...sharedProps}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 18.5c1.5-3 4-4.5 6.5-4.5s5 1.5 6.5 4.5" />
      </svg>
    ),
    D: (
      <svg {...sharedProps}>
        <path d="M7 6.5h7l3 3v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
        <path d="M14 6.5v3h3" />
      </svg>
    ),
    U: (
      <svg {...sharedProps}>
        <path d="M6 7.5h12" />
        <path d="M8 12h8" />
        <path d="M10 16.5h4" />
      </svg>
    ),
    Y: (
      <svg {...sharedProps}>
        <path d="M12 4.5 6.5 7.5v4.5c0 3.3 2.1 6.2 5.5 7.5 3.4-1.3 5.5-4.2 5.5-7.5V7.5L12 4.5Z" />
        <path d="M9.5 12.2 11.2 14l3.3-3.5" />
      </svg>
    )
  };

  return icons[kind ?? ""] ?? <span className="mobile-tab-icon-fallback">{kind ?? "."}</span>;
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
              <MobileTabIcon kind={item.icon} />
            </span>
            <span className="mobile-tab-label">{item.mobileLabel ?? item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
