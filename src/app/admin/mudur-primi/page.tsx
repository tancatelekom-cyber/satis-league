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
import { defaultManagerPrimeSettings, fetchManagerPrimeStoreCategoryOptions, getManagerPrimeSettings } from "@/lib/manager-prime";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";
import type { UserRole } from "@/lib/types";
import {
  updateManagerPrimeMappingAction,
  updateManagerPrimeMenuPermissionAction,
  updateManagerPrimeUserPermissionAction
} from "@/app/admin/mudur-primi/actions";

type AdminManagerPrimePageProps = {
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

const columnOptions = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const mappingConfigs = [
  { key: "recontract", label: "Rekontratlama", categoryField: "recontractCategory", columnField: "recontract", formColumnField: "recontractColumn" },
  { key: "production", label: "Uretim Puani", categoryField: "productionCategory", columnField: "production", formColumnField: "productionColumn" },
  { key: "activation", label: "Aktivasyon Puan", categoryField: "activationCategory", columnField: "activation", formColumnField: "activationColumn" },
  { key: "terminal", label: "Terminal", categoryField: "terminalCategory", columnField: "terminal", formColumnField: "terminalColumn" },
  { key: "sol", label: "SOL", categoryField: "solCategory", columnField: "sol", formColumnField: "solColumn" },
  { key: "accessory", label: "Aksesuar Karlilik", categoryField: "accessoryCategory", columnField: "accessory", formColumnField: "accessoryColumn" }
] as const;

export default async function AdminManagerPrimePage({ searchParams }: AdminManagerPrimePageProps) {
  const params = searchParams ? await searchParams : undefined;

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const admin = createAdminClient();
  const [{ permissions, persisted }, profilePermissions, approvedProfilesResult, settings, categoryOptions] = await Promise.all([
    getFeatureMenuPermissions(),
    getFeatureProfilePermissions("mudur-primi"),
    admin
      .from("profiles")
      .select("id, full_name, role, store:stores(name)")
      .eq("approval", "approved")
      .order("full_name", { ascending: true }),
    getManagerPrimeSettings(),
    fetchManagerPrimeStoreCategoryOptions()
  ]);

  const featurePermission = permissions.find((permission) => permission.key === "mudur-primi");
  const approvedProfiles = ((approvedProfilesResult.data as ApprovedProfileRow[] | null) ?? []).filter((profile) => profile.full_name);

  return (
    <main>
      <h1 className="page-title">Mudur Primi Yonetimi</h1>
      <p className="page-subtitle">
        Magaza muduru prim menusunun rol yetkilerini ve magaza hedef gerceklesen kategorilerinin prim skalasi sutunlariyla eslesmesini yonetin.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>{params.message}</div>
      ) : null}

      <AdminSectionNav currentPath="/admin/mudur-primi" />

      {!persisted ? (
        <div className="message-box error-box">
          `feature_menu_permissions` tablosu bulunamadi. Once `supabase/schema.sql` icindeki yeni SQL'i Supabase'e uygulayin.
        </div>
      ) : null}

      {featurePermission ? (
        <>
          <section className="admin-card">
            <h3>{featurePermission.label}</h3>
            <p>Bu menu aktif olan rollerde ust menude gorunur.</p>

            <form action={updateManagerPrimeMenuPermissionAction} className="admin-form">
              <input type="hidden" name="featureKey" value={featurePermission.key} />

              <div className="checkbox-grid permission-checkbox-grid">
                <label className="field-inline">
                  <input defaultChecked={featurePermission.employeeVisible} name="employeeVisible" type="checkbox" />
                  <span>Calisan</span>
                </label>
                <label className="field-inline">
                  <input defaultChecked={featurePermission.managerVisible} name="managerVisible" type="checkbox" />
                  <span>Magaza Muduru</span>
                </label>
                <label className="field-inline">
                  <input defaultChecked={featurePermission.managementVisible} name="managementVisible" type="checkbox" />
                  <span>Yonetim</span>
                </label>
                <label className="field-inline">
                  <input defaultChecked={featurePermission.adminVisible} name="adminVisible" type="checkbox" />
                  <span>Admin</span>
                </label>
              </div>

              <button className="button-primary tariff-admin-submit" type="submit">
                Rol Yetkilerini Kaydet
              </button>
            </form>
          </section>

          <section className="admin-card">
            <h3>Kategori ve Sutun Eslesmeleri</h3>
            <p>
              Prim hesaplamasi, Magaza Hedef Gerceklesen ekranindaki kategori adlari ile bu prim skalasi sheetindeki sutun harflerini eslestirerek yapilir.
            </p>

            <form action={updateManagerPrimeMappingAction} className="admin-form">
              <div className="user-management-grid">
                <label className="field">
                  <span>Skala Yuzdesi Sutunu</span>
                  <select defaultValue={settings.scale} name="scaleColumn">
                    {columnOptions.map((option) => (
                      <option key={`scale-${option}`} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {mappingConfigs.map(({ key, label, categoryField, columnField, formColumnField }) => {
                const currentCategory = settings[categoryField] ?? defaultManagerPrimeSettings[categoryField];
                const currentColumn = settings[columnField] ?? defaultManagerPrimeSettings[columnField];

                return (
                  <div key={`manager-prime-map-${key}`} className="user-management-grid">
                    <label className="field">
                      <span>{label} kategori adi</span>
                      <select defaultValue={currentCategory} name={categoryField}>
                        {categoryOptions.map((category) => (
                          <option key={`${key}-${category}`} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>{label} sheet sutunu</span>
                      <select defaultValue={currentColumn} name={formColumnField}>
                        {columnOptions.map((option) => (
                          <option key={`${key}-column-${option}`} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                );
              })}

              <button className="button-primary tariff-admin-submit" type="submit">
                Eslesmeleri Kaydet
              </button>
            </form>
          </section>

          <section className="admin-card">
            <h3>Kullanici Bazli Mudur Primi Yetkisi</h3>
            <p>Burada rol varsayilani, ozel acik veya ozel kapali secerek menuyu kullanici bazinda yonetebilirsiniz.</p>

            <div className="admin-stack">
              {approvedProfiles.map((profile) => {
                const overrideMode = resolveFeatureProfilePermissionMode(profilePermissions, profile.id, "mudur-primi");
                const roleAccess = canRoleAccessFeature(featurePermission, profile.role);
                const effectiveAccess =
                  overrideMode === "allow" ? true : overrideMode === "deny" ? false : roleAccess;

                return (
                  <article key={profile.id} className="admin-card">
                    <form action={updateManagerPrimeUserPermissionAction} className="admin-form">
                      <input type="hidden" name="featureKey" value="mudur-primi" />
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
                            <option value="inherit">Rol varsayilani ({roleAccess ? "acik" : "kapali"})</option>
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
