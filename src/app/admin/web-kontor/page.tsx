import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { getFeatureMenuPermissions } from "@/lib/feature-menu-permissions";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";
import { updateWebKontorMenuPermissionAction } from "@/app/admin/web-kontor/actions";

type AdminWebKontorPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

export default async function AdminWebKontorPage({ searchParams }: AdminWebKontorPageProps) {
  const params = searchParams ? await searchParams : undefined;

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const { permissions, persisted } = await getFeatureMenuPermissions();
  const webKontorPermission = permissions.find((permission) => permission.key === "web-kontor");

  return (
    <main>
      <h1 className="page-title">Web Kontor Yonetimi</h1>
      <p className="page-subtitle">
        Web Kontor menusunun hangi rollerde gorunecegini buradan degistirebilirsiniz.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <AdminSectionNav currentPath="/admin/web-kontor" />

      {!persisted ? (
        <div className="message-box error-box">
          `feature_menu_permissions` tablosu bulunamadi. Once `supabase/schema.sql` icindeki yeni SQL'i Supabase'e uygulayin.
        </div>
      ) : null}

      {webKontorPermission ? (
        <section className="admin-card">
          <h3>{webKontorPermission.label}</h3>
          <p>Bu menu aktif olan rollerde ust menude ve mobil hizli menude gorunur.</p>

          <form action={updateWebKontorMenuPermissionAction} className="admin-form">
            <input type="hidden" name="featureKey" value={webKontorPermission.key} />

            <div className="checkbox-grid permission-checkbox-grid">
              <label className="field-inline">
                <input defaultChecked={webKontorPermission.employeeVisible} name="employeeVisible" type="checkbox" />
                <span>Calisan</span>
              </label>
              <label className="field-inline">
                <input defaultChecked={webKontorPermission.managerVisible} name="managerVisible" type="checkbox" />
                <span>Magaza Muduru</span>
              </label>
              <label className="field-inline">
                <input defaultChecked={webKontorPermission.managementVisible} name="managementVisible" type="checkbox" />
                <span>Yonetim</span>
              </label>
              <label className="field-inline">
                <input defaultChecked={webKontorPermission.adminVisible} name="adminVisible" type="checkbox" />
                <span>Admin</span>
              </label>
            </div>

            <button className="button-primary tariff-admin-submit" type="submit">
              Yetkileri Kaydet
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
