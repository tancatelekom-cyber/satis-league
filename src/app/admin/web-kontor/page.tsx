import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import {
  canRoleAccessFeature,
  getFeatureMenuPermissions,
  getFeatureProfilePermissions,
  resolveFeatureProfilePermissionMode
} from "@/lib/feature-menu-permissions";
import { roleLabels } from "@/lib/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";
import { updateWebKontorMenuPermissionAction, updateWebKontorUserPermissionAction } from "@/app/admin/web-kontor/actions";
import type { UserRole } from "@/lib/types";

type AdminWebKontorPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

type ApprovedProfileRow = {
  id: string;
  full_name: string;
  role: UserRole;
  store: {
    name: string;
  } | null;
};

export default async function AdminWebKontorPage({ searchParams }: AdminWebKontorPageProps) {
  const params = searchParams ? await searchParams : undefined;

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const admin = createAdminClient();
  const [{ permissions, persisted }, profilePermissions, approvedProfilesResult] = await Promise.all([
    getFeatureMenuPermissions(),
    getFeatureProfilePermissions("web-kontor"),
    admin
      .from("profiles")
      .select("id, full_name, role, store:stores(name)")
      .eq("approval", "approved")
      .order("full_name", { ascending: true })
  ]);
  const webKontorPermission = permissions.find((permission) => permission.key === "web-kontor");
  const approvedProfiles = ((approvedProfilesResult.data as ApprovedProfileRow[] | null) ?? []).filter((profile) => profile.full_name);

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
        <>
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
                Rol Yetkilerini Kaydet
              </button>
            </form>
          </section>

          <section className="admin-card">
            <h3>Kullanici Bazli Web Kontor Yetkisi</h3>
            <p>
              Burada `Rol varsayilani`, `Ozel acik` veya `Ozel kapali` secerek her kullanici icin menuyu tek tek yonetebilirsiniz.
            </p>

            <div className="admin-stack">
              {approvedProfiles.map((profile) => {
                const overrideMode = resolveFeatureProfilePermissionMode(profilePermissions, profile.id, "web-kontor");
                const roleAccess = canRoleAccessFeature(webKontorPermission, profile.role);
                const effectiveAccess =
                  overrideMode === "allow" ? true : overrideMode === "deny" ? false : roleAccess;

                return (
                  <article key={profile.id} className="admin-card">
                    <form action={updateWebKontorUserPermissionAction} className="admin-form">
                      <input type="hidden" name="featureKey" value="web-kontor" />
                      <input type="hidden" name="profileId" value={profile.id} />

                      <div className="user-management-head">
                        <div>
                          <strong>{profile.full_name}</strong>
                          <span>
                            {roleLabels[profile.role]} {profile.store?.name ? `| ${profile.store.name}` : "| Merkez"}
                          </span>
                        </div>
                        <span className={`status-chip ${effectiveAccess ? "approve" : ""}`}>
                          {effectiveAccess ? "Menu acik" : "Menu kapali"}
                        </span>
                      </div>

                      <div className="user-management-grid">
                        <label className="field">
                          <span>Kullanici Yetkisi</span>
                          <select name="mode" defaultValue={overrideMode}>
                            <option value="inherit">
                              Rol varsayilani ({roleAccess ? "acik" : "kapali"})
                            </option>
                            <option value="allow">Ozel acik</option>
                            <option value="deny">Ozel kapali</option>
                          </select>
                        </label>
                      </div>

                      <div className="action-row">
                        <button className="tiny-button approve" type="submit">
                          Kullanici Yetkisini Kaydet
                        </button>
                      </div>
                    </form>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
