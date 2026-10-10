import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { LineTraffic } from "@/components/admin/line-traffic";
import { requireAdminAccess } from "@/lib/auth/require-admin";

export default async function LineTrafficPage() {
  await requireAdminAccess();
  return <main className="admin-center-page">
    <h1 className="page-title">Hat Trafik Oluşturma</h1>
    <AdminSectionNav currentPath="/admin/hat-trafik" />
    <LineTraffic />
  </main>;
}
