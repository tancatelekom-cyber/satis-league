import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/auth-gate";
import { AppShellHeader } from "@/components/app-shell-header";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "TANCA+",
  description: "Satis ekibini motive eden mobil uyumlu web oyunu"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  let isAdmin = false;
  let canEvaluate = false;
  let canOpenEvaluationPresentation = false;

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
    }
  } catch {
    isAdmin = false;
    canEvaluate = false;
    canOpenEvaluationPresentation = false;
  }

  return (
    <html lang="tr">
      <body>
        <div className="page-shell">
          <AppShellHeader
            initialIsAdmin={isAdmin}
            initialCanEvaluate={canEvaluate}
            initialCanOpenEvaluationPresentation={canOpenEvaluationPresentation}
          />

          <AuthGate>{children}</AuthGate>
        </div>
      </body>
    </html>
  );
}
