import type { Metadata } from "next";
import { AppShellHeader } from "@/components/app-shell-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "TANCA+",
  description: "Satis ekibini motive eden mobil uyumlu web oyunu"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>
        <div className="page-shell">
          <AppShellHeader />

          {children}
        </div>
      </body>
    </html>
  );
}
