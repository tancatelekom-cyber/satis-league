import { ProtectedLayout } from "@/components/auth/protected-layout";

export default function KampanyalarLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
