import { ProtectedLayout } from "@/components/auth/protected-layout";

export default function KontrolListesiLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
