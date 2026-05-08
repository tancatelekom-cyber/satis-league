import { ProtectedLayout } from "@/components/auth/protected-layout";

export default function LigLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
