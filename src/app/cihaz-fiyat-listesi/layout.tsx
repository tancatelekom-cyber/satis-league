import { ProtectedLayout } from "@/components/auth/protected-layout";

export default function CihazFiyatListesiLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
