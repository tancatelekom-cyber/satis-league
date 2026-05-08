import { ProtectedLayout } from "@/components/auth/protected-layout";

export default function HesabimLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
