import type { Metadata, Viewport } from "next";
import { AuthGate } from "@/components/auth/auth-gate";
import { AppShellHeader } from "@/components/app-shell-header";
import { PwaRegister } from "@/components/pwa-register";
import { getResolvedFeatureAccessForProfile } from "@/lib/feature-menu-permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import "./globals.css";

export const metadata: Metadata = {
  title: "TANCA+",
  description: "Satis ekibini motive eden mobil uyumlu web oyunu",
  manifest: "/manifest.webmanifest?v=7",
  icons: {
    icon: [
      { url: "/favicon.ico?v=7", sizes: "any" },
      { url: "/favicon.png?v=7", sizes: "64x64", type: "image/png" },
      { url: "/icon-192.png?v=7", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=7", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png?v=7", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico?v=7"]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tanca+"
  }
};

export const viewport: Viewport = {
  themeColor: "#0b2143",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  let isAdmin = false;
  let canEvaluate = false;
  let canOpenEvaluationPresentation = false;
  let canOpenWorkSchedule = false;
  let canOpenManagerPrime = false;
  let canOpenRevenueExpense = false;
  let canOpenWebKontor = false;
  let canOpenMissingDocs = false;
  let dashboardRole: "manager" | "management" | "admin" | null = null;
  let pendingRequestCount = 0;

  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, approval, store_id")
        .eq("id", user.id)
        .single();

      isAdmin = profile?.role === "admin" && profile?.approval === "approved";
      canEvaluate =
        profile?.approval === "approved" &&
        (profile.role === "admin" || profile.role === "management" || profile.role === "manager" || profile.role === "employee");
      canOpenEvaluationPresentation =
        profile?.approval === "approved" &&
        (profile.role === "admin" || profile.role === "management" || profile.role === "manager");
      canOpenWorkSchedule = profile?.approval === "approved";
      dashboardRole =
        profile?.approval === "approved" && (profile.role === "manager" || profile.role === "management" || profile.role === "admin")
          ? profile.role as UserRole & ("manager" | "management" | "admin")
          : null;

      if (profile?.approval === "approved") {
        const requestAdmin = createAdminClient();
        if (profile.role === "manager" && profile.store_id) {
          const { count } = await requestAdmin.from("employee_requests").select("id", { count: "exact", head: true }).eq("status", "manager_pending").eq("store_id", profile.store_id);
          pendingRequestCount += count ?? 0;
        }
        if (profile.role === "admin") {
          const { count } = await requestAdmin.from("employee_requests").select("id", { count: "exact", head: true }).eq("status", "admin_pending").is("current_assignee_id", null);
          pendingRequestCount += count ?? 0;
        }
        if (user.id === "de688a42-d22a-48fa-b86f-32552bf2e1ac") {
          const { count } = await requestAdmin.from("employee_requests").select("id", { count: "exact", head: true }).eq("status", "admin_pending").eq("current_assignee_id", user.id);
          pendingRequestCount += count ?? 0;
        }
        if (user.id === "7998f539-5077-472b-ba65-a1d45533eafa") {
          const { count } = await requestAdmin.from("employee_requests").select("id", { count: "exact", head: true }).eq("status", "implementation_pending").eq("current_assignee_id", user.id);
          pendingRequestCount += count ?? 0;
          const { count: suitabilityCount } = await requestAdmin.from("employee_requests").select("id", { count: "exact", head: true }).eq("status", "suitability_pending").eq("current_assignee_id", user.id);
          pendingRequestCount += suitabilityCount ?? 0;
        }
        const resolvedManagerPrimeAccess = await getResolvedFeatureAccessForProfile("mudur-primi", user.id, profile.role);
        canOpenManagerPrime = resolvedManagerPrimeAccess.allowed;
        const resolvedRevenueExpenseAccess = await getResolvedFeatureAccessForProfile("gelir-gider", user.id, profile.role);
        canOpenRevenueExpense = resolvedRevenueExpenseAccess.allowed;
        const resolvedFeatureAccess = await getResolvedFeatureAccessForProfile("web-kontor", user.id, profile.role);
        canOpenWebKontor = resolvedFeatureAccess.allowed;
        const resolvedMissingDocsAccess = await getResolvedFeatureAccessForProfile("eksik-evrak", user.id, profile.role);
        canOpenMissingDocs = resolvedMissingDocsAccess.allowed;
      }
    }
  } catch {
    isAdmin = false;
    canEvaluate = false;
    canOpenEvaluationPresentation = false;
    canOpenWorkSchedule = false;
    canOpenManagerPrime = false;
    canOpenRevenueExpense = false;
    canOpenWebKontor = false;
    canOpenMissingDocs = false;
    dashboardRole = null;
    pendingRequestCount = 0;
  }

  return (
    <html lang="tr">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#0b2143" />
        <link rel="shortcut icon" href="/favicon.ico?v=7" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico?v=7" />
        <link rel="icon" type="image/png" sizes="64x64" href="/favicon.png?v=7" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=7" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png?v=7" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=7" />
      </head>
      <body>
        <div className="page-shell">
          <PwaRegister />
          <AppShellHeader
            initialIsAdmin={isAdmin}
            initialCanEvaluate={canEvaluate}
            initialCanOpenEvaluationPresentation={canOpenEvaluationPresentation}
            initialCanOpenWorkSchedule={canOpenWorkSchedule}
            initialCanOpenManagerPrime={canOpenManagerPrime}
            initialCanOpenRevenueExpense={canOpenRevenueExpense}
            initialCanOpenWebKontor={canOpenWebKontor}
            initialCanOpenMissingDocs={canOpenMissingDocs}
            initialDashboardRole={dashboardRole}
            initialPendingRequestCount={pendingRequestCount}
          />

          <AuthGate>{children}</AuthGate>
        </div>
      </body>
    </html>
  );
}
