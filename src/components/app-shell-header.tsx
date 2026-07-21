"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getDashboardPalette } from "@/lib/dashboard-colors";

type NavItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  icon?: string;
};

const baseNavItems: NavItem[] = [
  { href: "/", label: "Ana Sayfa", icon: "🏠" },
  { href: "/hedef-gerceklesen", label: "Hedef Gerceklesen", mobileLabel: "Hedef", icon: "🎯" },
  { href: "/magaza-muduru-primi", label: "Magaza Muduru Primi", mobileLabel: "Mudur Prim", icon: "💰" },
  { href: "/gelir-gider", label: "Gelir Gider", mobileLabel: "Gelir", icon: "📊" },
  { href: "/web-kontor", label: "Web Kontor", mobileLabel: "Kontor", icon: "🌐" },
  { href: "/eksik-evrak", label: "Eksik Evrak", mobileLabel: "Evrak", icon: "📄" },
  { href: "/pos-komisyon", label: "POS Komisyon", mobileLabel: "POS", icon: "💳" },
  { href: "/tarifeler", label: "Tarifeler", mobileLabel: "Tarife", icon: "📶" },
  { href: "/cihaz-fiyat-listesi", label: "Cihaz Fiyat Listesi", mobileLabel: "Cihaz", icon: "📱" },
  { href: "/haftalik-calisma-programi", label: "Haftalik Calisma Programi", mobileLabel: "Program", icon: "📅" },
  { href: "/kampanyalar", label: "Gunluk Kampanyalar", mobileLabel: "Kampanya", icon: "🏆" },
  { href: "/aylik-kampanyalar", label: "Aylik Kampanyalar", mobileLabel: "Aylik", icon: "🗓️" },
  { href: "/lig", label: "Yildizlar Kulubu", mobileLabel: "Lig", icon: "⭐" },
  { href: "/stok-bilgisi", label: "Stok Bilgisi", mobileLabel: "Stok", icon: "📦" },
  { href: "/hesabim", label: "Hesabim", mobileLabel: "Hesap", icon: "👤" }
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type AppShellHeaderProps = {
  initialIsAdmin?: boolean;
  initialCanEvaluate?: boolean;
  initialCanOpenEvaluationPresentation?: boolean;
  initialCanOpenWorkSchedule?: boolean;
  initialCanOpenManagerPrime?: boolean;
  initialCanOpenRevenueExpense?: boolean;
  initialCanOpenWebKontor?: boolean;
  initialCanOpenMissingDocs?: boolean;
  initialDashboardRole?: "manager" | "management" | "admin" | null;
};

type HeaderSuccessData = {
  visible: boolean;
  label: string;
  percent: number;
  href: string;
  colorBlindMode?: boolean;
};

export function AppShellHeader({
  initialIsAdmin = false,
  initialCanEvaluate = false,
  initialCanOpenEvaluationPresentation = false,
  initialCanOpenWorkSchedule = false,
  initialCanOpenManagerPrime = false,
  initialCanOpenRevenueExpense = false,
  initialCanOpenWebKontor = false,
  initialCanOpenMissingDocs = false,
  initialDashboardRole = null
}: AppShellHeaderProps) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [successData, setSuccessData] = useState<HeaderSuccessData | null>(null);
  const headerDashboardPalette = getDashboardPalette(Boolean(successData?.colorBlindMode));

  useEffect(() => {
    if (pathname !== "/" || !initialDashboardRole) {
      setSuccessData(null);
      return;
    }

    const controller = new AbortController();
    fetch("/api/dashboard-success", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() as Promise<HeaderSuccessData> : null))
      .then((data) => setSuccessData(data?.visible ? data : null))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setSuccessData(null);
      });

    return () => controller.abort();
  }, [initialDashboardRole, pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    function closeOnOutsideClick(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".menu-toggle, .desktop-nav-dropdown, .mobile-nav-overlay")) return;
      setMenuOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [menuOpen]);

  const navItems = useMemo(() => {
    const items = false && initialCanEvaluate
      ? [...baseNavItems, { href: "/degerlendirme", label: "Degerlendirme", mobileLabel: "Deger", icon: "📝" }]
      : baseNavItems;

    const itemsWithManagerPrime = initialCanOpenManagerPrime
      ? items
      : items.filter((item) => item.href !== "/magaza-muduru-primi");

    const itemsWithRevenueExpense = initialCanOpenRevenueExpense
      ? itemsWithManagerPrime
      : itemsWithManagerPrime.filter((item) => item.href !== "/gelir-gider");

    const itemsWithManagerPrimeAndWebKontor = initialCanOpenWebKontor
      ? itemsWithRevenueExpense
      : itemsWithRevenueExpense.filter((item) => item.href !== "/web-kontor");

    const itemsWithMissingDocs = initialCanOpenMissingDocs
      ? itemsWithManagerPrimeAndWebKontor
      : itemsWithManagerPrimeAndWebKontor.filter((item) => item.href !== "/eksik-evrak");

    const itemsWithWorkSchedule = initialCanOpenWorkSchedule
      ? itemsWithMissingDocs
      : itemsWithMissingDocs.filter((item) => item.href !== "/haftalik-calisma-programi");

    const itemsWithPresentation = initialCanOpenEvaluationPresentation
      ? [...itemsWithWorkSchedule, { href: "/degerlendirme-sunumu", label: "Degerlendirme Sunumu", mobileLabel: "Sunum", icon: "📈" }]
      : itemsWithWorkSchedule;

    return initialIsAdmin
      ? [...itemsWithPresentation, { href: "/admin", label: "Admin Paneli", mobileLabel: "Admin", icon: "⚙️" }]
      : itemsWithPresentation;
  }, [initialCanEvaluate, initialCanOpenEvaluationPresentation, initialCanOpenManagerPrime, initialCanOpenMissingDocs, initialCanOpenRevenueExpense, initialCanOpenWebKontor, initialCanOpenWorkSchedule, initialIsAdmin]);

  return (
    <header className="topbar topbar-app">
      <Link className="brand" href="/" onClick={() => setMenuOpen(false)}>
        <span className="brand-badge">
          <Image src="/tplus-logo.png" alt="TANCA+ logo" width={60} height={60} className="brand-logo-image" priority />
        </span>
        <span>TANCA+</span>
      </Link>

      {pathname === "/" && initialDashboardRole ? (
        successData ? (
          <Link
            className="header-success-link"
            href={successData.href}
            onClick={() => setMenuOpen(false)}
            aria-label={`${successData.label} yüzde ${successData.percent.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}. Dashboardu aç.`}
          >
            <span
              className="header-success-ring"
              style={{
                background: `conic-gradient(${successData.percent >= 80 ? headerDashboardPalette.success : successData.percent >= 60 ? headerDashboardPalette.near : headerDashboardPalette.risk} 0% ${Math.max(0, Math.min(100, successData.percent))}%, rgba(219, 231, 239, 0.28) ${Math.max(0, Math.min(100, successData.percent))}% 100%)`
              }}
            >
              <span>%{successData.percent.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</span>
            </span>
            <span className="header-success-label">{successData.label}</span>
          </Link>
        ) : (
          <span className="header-success-placeholder" aria-hidden="true" />
        )
      ) : null}

      <div className="nav-cluster">
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="app-navigation-menu-desktop app-navigation-menu-mobile"
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? "Kapat" : "Menü"}
        </button>

        {menuOpen ? (
          <nav
            className="desktop-nav-dropdown"
            id="app-navigation-menu-desktop"
            aria-label="Masaüstü uygulama menüsü"
          >
            {navItems.map((item) => (
              <Link
                key={`desktop-${item.href}`}
                className={`nav-link ${isActive(pathname, item.href) ? "nav-link-active" : ""}`}
                href={item.href}
                onClick={() => setMenuOpen(false)}
              >
                <span className="nav-link-icon" aria-hidden="true">{item.icon ?? "•"}</span>
                <span className="nav-link-label">{item.label}</span>
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {menuOpen && typeof document !== "undefined"
        ? createPortal(
            <nav className="mobile-nav-overlay" id="app-navigation-menu-mobile" aria-label="Mobil uygulama menusu">
              {navItems.map((item) => (
                <Link
                  key={`mobile-${item.href}`}
                  className={`nav-link ${isActive(pathname, item.href) ? "nav-link-active" : ""}`}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="nav-link-icon" aria-hidden="true">{item.icon ?? "•"}</span>
                  <span className="nav-link-label">{item.label}</span>
                </Link>
              ))}
            </nav>,
            document.body
          )
        : null}
    </header>
  );
}
