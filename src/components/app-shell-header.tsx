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
  { href: "/hedef-gerceklesen", label: "Hedef Gerceklesen", mobileLabel: "Hedef", icon: "H" },
  { href: "/magaza-muduru-primi", label: "Magaza Muduru Primi", mobileLabel: "Mudur Prim", icon: "R" },
  { href: "/gelir-gider", label: "Gelir Gider", mobileLabel: "Gelir", icon: "G" },
  { href: "/web-kontor", label: "Web Kontor", mobileLabel: "Kontor", icon: "O" },
  { href: "/eksik-evrak", label: "Eksik Evrak", mobileLabel: "Evrak", icon: "E" },
  { href: "/pos-komisyon", label: "POS Komisyon", mobileLabel: "POS", icon: "M" },
  { href: "/tarifeler", label: "Tarifeler", mobileLabel: "Tarife", icon: "T" },
  { href: "/cihaz-fiyat-listesi", label: "Cihaz Fiyat Listesi", mobileLabel: "Cihaz", icon: "C" },
  { href: "/haftalik-calisma-programi", label: "Haftalik Calisma Programi", mobileLabel: "Program", icon: "W" },
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

type AppShellHeaderProps = {
  initialIsAdmin?: boolean;
  initialCanEvaluate?: boolean;
  initialCanOpenEvaluationPresentation?: boolean;
  initialCanOpenWorkSchedule?: boolean;
  initialCanOpenManagerPrime?: boolean;
  initialCanOpenRevenueExpense?: boolean;
  initialCanOpenWebKontor?: boolean;
  initialCanOpenMissingDocs?: boolean;
};

export function AppShellHeader({
  initialIsAdmin = false,
  initialCanEvaluate = false,
  initialCanOpenEvaluationPresentation = false,
  initialCanOpenWorkSchedule = false,
  initialCanOpenManagerPrime = false,
  initialCanOpenRevenueExpense = false,
  initialCanOpenWebKontor = false,
  initialCanOpenMissingDocs = false
}: AppShellHeaderProps) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = useMemo(() => {
    const items = false && initialCanEvaluate
      ? [...baseNavItems, { href: "/degerlendirme", label: "Degerlendirme", mobileLabel: "Deger", icon: "D" }]
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
      ? [...itemsWithWorkSchedule, { href: "/degerlendirme-sunumu", label: "Degerlendirme Sunumu", mobileLabel: "Sunum", icon: "U" }]
      : itemsWithWorkSchedule;

    return initialIsAdmin
      ? [...itemsWithPresentation, { href: "/admin", label: "Admin Paneli", mobileLabel: "Admin", icon: "Y" }]
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
  );
}
