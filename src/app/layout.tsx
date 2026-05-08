import type { Metadata } from "next";
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
    }
  } catch {
    isAdmin = false;
  }

  return (
    <html lang="tr">
      <body>
        <div className="page-shell">
          <AppShellHeader initialIsAdmin={isAdmin} />

          {children}
        </div>
      </body>
    </html>
  );
}
