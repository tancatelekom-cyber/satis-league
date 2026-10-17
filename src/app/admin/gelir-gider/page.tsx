import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRevenueExpenseEditor } from "@/lib/revenue-expense-permissions";
import { updateRevenueExpenseUserPermissionAction } from "./actions";
export default async function AdminRevenueExpensePage({searchParams}:{searchParams?:Promise<{message?:string;type?:string}>}) {
  await requireAdminAccess();const params=await searchParams;const admin=createAdminClient();
  const [profiles,permissions]=await Promise.all([admin.from("profiles").select("id,full_name,role").eq("approval","approved").order("full_name"),admin.from("feature_profile_permissions").select("profile_id,is_allowed").eq("feature_key","gelir-gider")]);
  if(profiles.error||permissions.error)return <main><h1>Gelir Gider Yönetimi</h1><p>İzinler okunamadı. Sayfayı yenileyin.</p></main>;
  const allowed=new Set(permissions.data?.filter(p=>p.is_allowed).map(p=>p.profile_id));
  return <main><h1 className="page-title">Gelir Gider Yetkileri</h1><AdminSectionNav currentPath="/admin/gelir-gider" />
    <p>Yalnızca burada görüntüleme izni verilen profiller gelir-gider menüsünü ve raporlarını görebilir. Rol bazında otomatik erişim verilmez.</p>
    <p>Veri girişi sadece Duygu Bozgeyik ve Yavuz Yılmaz’a açıktır. Bu iki hesapta da görüntüleme izni açık olmalıdır.</p>
    {params?.message&&<p role="status" className={`message-box ${params.type==="error"?"error-box":"success-box"}`}>{params.message}</p>}
    <section className="admin-stack">{profiles.data?.map(profile=><form key={profile.id} action={updateRevenueExpenseUserPermissionAction} className="admin-card admin-form">
      <input type="hidden" name="profileId" value={profile.id}/><strong>{profile.full_name}</strong>
      <span>{isRevenueExpenseEditor(profile.id)?"Veri girişi ve görüntüleme":"Yalnızca görüntüleme"}</span>
      <label className="field">Görüntüleme izni<select name="mode" defaultValue={allowed.has(profile.id)?"allow":"deny"}><option value="allow">Açık</option><option value="deny">Kapalı</option></select></label>
      <button className="button-primary" type="submit">Yetkiyi kaydet</button>
    </form>)}</section></main>;
}
