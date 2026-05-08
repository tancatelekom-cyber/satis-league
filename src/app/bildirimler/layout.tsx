import { ProtectedLayout } from "@/components/auth/protected-layout";

export default function BildirimlerLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
