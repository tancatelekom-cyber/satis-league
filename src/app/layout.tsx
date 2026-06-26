import type { Metadata, Viewport } from "next";
import { AuthGate } from "@/components/auth/auth-gate";
import { AppShellHeader } from "@/components/app-shell-header";
import { PwaRegister } from "@/components/pwa-register";
import { getResolvedFeatureAccessForProfile } from "@/lib/feature-menu-permissions";
import { createClient } from "@/lib/supabase/server";
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
  let canOpenWebKontor = false;
  let canOpenMissingDocs = false;

  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, approval")
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

      if (profile?.approval === "approved") {
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
    canOpenWebKontor = false;
    canOpenMissingDocs = false;
  }

  return (
    <html lang="tr">
      <head>
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
            initialCanOpenWebKontor={canOpenWebKontor}
            initialCanOpenMissingDocs={canOpenMissingDocs}
          />

          <AuthGate>{children}</AuthGate>
        </div>
      </body>
    </html>
  );
}
