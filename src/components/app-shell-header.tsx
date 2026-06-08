"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";

type NavItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  icon?: string;
};

const baseNavItems: NavItem[] = [
  { href: "/", label: "Ana Sayfa" },
  { href: "/hedef-gerceklesen", label: "Hedef Gerceklesen", mobileLabel: "Hedef", icon: "H" },
  { href: "/tarifeler", label: "Tarifeler", mobileLabel: "Tarife", icon: "T" },
  { href: "/cihaz-fiyat-listesi", label: "Cihaz Fiyat Listesi", mobileLabel: "Cihaz", icon: "C" },
  { href: "/kampanyalar", label: "Gunluk Kampanyalar", mobileLabel: "Kampanya", icon: "K" },
  { href: "/aylik-kampanyalar", label: "Aylik Kampanyalar", mobileLabel: "Aylik", icon: "A" },
  { href: "/lig", label: "Yildizlar Kulubu", mobileLabel: "Lig", icon: "L" },
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
        <path d="M5 14.5V9.5a1.5 1.5 0 0 1 1.5-1.5h5l4.5-2v12l-4.5-2h-5A1.5 1.5 0 0 1 5 14.5Z" />
        <path d="M18 10.5a3.5 3.5 0 0 1 0 5" />
        <path d="M8 16.5v2" />
      </svg>
    ),
    A: (
      <svg {...sharedProps}>
        <rect x="4.5" y="5.5" width="15" height="13" rx="2.5" />
        <path d="M8 9.5h8" />
        <path d="M8 13h5" />
        <path d="m11.5 5.5.8-2 .8 2" />
      </svg>
    ),
    L: (
      <svg {...sharedProps}>
        <path d="m12 5 1.8 3.8 4.2.6-3 2.9.7 4.2-3.7-2-3.7 2 .7-4.2-3-2.9 4.2-.6L12 5Z" />
      </svg>
    ),
    H: (
      <svg {...sharedProps}>
        <circle cx="12" cy="12" r="7.5" />
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 4.5v3" />
        <path d="M19.5 12h-3" />
      </svg>
    ),
    T: (
      <svg {...sharedProps}>
        <path d="M6 8h12l-3.5 5H9.5L6 8Z" />
        <path d="M8 13v4.5h8V13" />
      </svg>
    ),
    C: (
      <svg {...sharedProps}>
        <rect x="7" y="3.5" width="10" height="17" rx="2.5" />
        <path d="M10 6.5h4" />
        <path d="M11 17.5h2" />
      </svg>
    ),
    S: (
      <svg {...sharedProps}>
        <path d="M6 8.5h12v4H6z" />
        <path d="M8 12.5h12v4H8z" />
        <path d="M4 16.5h12v4H4z" />
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
  const mobileTabbarRef = useRef<HTMLElement | null>(null);

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
      "/hedef-gerceklesen",
      "/tarifeler",
      "/cihaz-fiyat-listesi",
      "/kampanyalar",
      "/aylik-kampanyalar",
      "/lig"
    ];
    return wanted.map((href) => navItems.find((item) => item.href === href)).filter((item): item is NavItem => Boolean(item));
  }, [navItems]);

  function scrollMobileTabs(direction: "left" | "right") {
    mobileTabbarRef.current?.scrollBy({
      left: direction === "left" ? -160 : 160,
      behavior: "smooth"
    });
  }

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

      <div className="mobile-tabbar-shell">
        <button
          className="mobile-tabbar-arrow mobile-tabbar-arrow-left"
          type="button"
          aria-label="Menüyü sola kaydır"
          onClick={() => scrollMobileTabs("left")}
        >
          ‹
        </button>
        <nav ref={mobileTabbarRef} className="mobile-tabbar" aria-label="Hizli menu">
          {primaryTabs.map((item) => (
            <Link
              key={item.href}
              className={`mobile-tab ${isActive(pathname, item.href) ? "mobile-tab-active" : ""}`}
              href={item.href}
            >
              <span className={`mobile-tab-icon mobile-tab-icon-${(item.icon ?? "default").toLowerCase()}`} aria-hidden="true">
                <MobileTabIcon kind={item.icon} />
              </span>
              <span className="mobile-tab-label">{item.mobileLabel ?? item.label}</span>
            </Link>
          ))}
        </nav>
        <button
          className="mobile-tabbar-arrow mobile-tabbar-arrow-right"
          type="button"
          aria-label="Menüyü sağa kaydır"
          onClick={() => scrollMobileTabs("right")}
        >
          ›
        </button>
      </div>
    </>
  );
}
