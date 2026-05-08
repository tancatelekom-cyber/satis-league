import { requireUser } from "@/lib/auth/require-user";

export async function ProtectedLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return <>{children}</>;
}
