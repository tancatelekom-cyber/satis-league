import { ProtectedLayout } from "@/components/auth/protected-layout";

export default function TarifelerLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
