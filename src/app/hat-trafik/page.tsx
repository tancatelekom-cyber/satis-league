import { redirect } from "next/navigation";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { LineTraffic } from "@/components/admin/line-traffic";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export default async function LineTrafficPage() {
  await requireUser();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/giris");
  const { data: profile } = await supabase.from("profiles").select("role, approval").eq("id", user.id).single();
  if (!profile || profile.approval !== "approved" || !["admin", "management", "manager"].includes(profile.role)) redirect("/hesabim");
  return <main className="admin-center-page">
    <h1 className="page-title">Hat Trafik Oluşturma</h1>
    {profile.role === "admin" ? <AdminSectionNav currentPath="/admin/hat-trafik" /> : null}
    <LineTraffic />
  </main>;
}
