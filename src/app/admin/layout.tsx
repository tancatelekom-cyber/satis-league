import { ProtectedLayout } from "@/components/auth/protected-layout";

export default function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
