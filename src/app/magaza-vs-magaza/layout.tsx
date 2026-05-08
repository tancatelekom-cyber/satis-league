import { ProtectedLayout } from "@/components/auth/protected-layout";

export default function MagazaVsMagazaLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
