import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { getAdminDashboardData } from "@/lib/admin/get-admin-dashboard-data";
import { buildOrganizationChartData } from "@/lib/admin/organization-chart";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";

export default async function OrganizationChartPage() {
  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const data = await getAdminDashboardData();
  const { coordinator, stores, unassignedProfiles, managerCount, employeeCount } =
    buildOrganizationChartData(data.managedProfileRows, data.storeRows);

  return (
    <main className="organization-page">
      <div className="organization-page-head">
        <div>
          <span className="organization-eyebrow">ŞUBE BAZLI HİYERARŞİ</span>
          <h1 className="page-title">Organizasyon Şeması</h1>
          <p className="page-subtitle">Genel koordinatör, mağaza müdürleri ve şube çalışanlarının güncel görünümü.</p>
        </div>
        <div className="organization-page-actions">
          <a className="button-primary" href="/admin/organizasyon/pdf">PDF İndir</a>
          <a className="button-secondary" href="/admin/onaylar">Kullanıcı Yönetimine Dön</a>
        </div>
      </div>

      <AdminSectionNav currentPath="/admin/organizasyon" />

      <section className="organization-chart-shell">
        <div className="organization-coordinator-wrap">
          <article className="organization-person-card organization-coordinator-card">
            <span className="organization-person-avatar" aria-hidden="true">⭐</span>
            <span className="organization-person-copy">
              <small>Genel Koordinatör</small>
              <strong>Emre Terzi</strong>
              {coordinator?.is_on_leave ? <em className="organization-leave-badge">İzinli</em> : null}
              {!coordinator ? <span>Kullanıcı kaydıyla eşleşmedi</span> : null}
            </span>
          </article>
        </div>

        <div className="organization-store-grid">
          {stores.map((store) => (
            <article className="organization-store-branch" key={store.id}>
              <header className="organization-store-head">
                <span aria-hidden="true">🏬</span>
                <div><strong>{store.name}</strong><small>{store.city ?? "Şube"}</small></div>
                <span className="organization-store-count">{store.employees.length + store.managers.length} kişi</span>
              </header>

              <section className="organization-manager-level">
                <span className="organization-level-label">Mağaza Müdürü</span>
                {store.managers.length ? (
                  store.managers.map((manager) => (
                    <div className="organization-person-row organization-manager-row" key={manager.id}>
                      <span className="organization-mini-avatar" aria-hidden="true">🧑‍💼</span>
                      <div>
                        <strong>{manager.full_name}</strong>
                        {manager.is_on_leave ? <em className="organization-leave-badge">İzinli</em> : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="organization-empty-role">Müdür atanmamış</div>
                )}
              </section>

              <section className="organization-employee-level">
                <span className="organization-level-label">Çalışanlar</span>
                <div className="organization-employee-list">
                  {store.employees.length ? (
                    store.employees.map((employee) => (
                      <div className="organization-person-row" key={employee.id}>
                        <span className="organization-mini-avatar" aria-hidden="true">👤</span>
                        <div>
                          <strong>{employee.full_name}</strong>
                          {employee.is_on_leave ? <em className="organization-leave-badge">İzinli</em> : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="organization-empty-role">Aktif çalışan yok</div>
                  )}
                </div>
              </section>
            </article>
          ))}
        </div>
      </section>

      <section className="organization-summary" aria-label="Organizasyon özeti">
        <div><span>🏬</span><strong>{stores.length}</strong><small>Şube</small></div>
        <div><span>🧑‍💼</span><strong>{managerCount}</strong><small>Mağaza Müdürü</small></div>
        <div><span>👥</span><strong>{employeeCount}</strong><small>Çalışan</small></div>
      </section>

      {unassignedProfiles.length ? (
        <section className="organization-unassigned">
          <div><strong>⚠️ Şubesi Atanmamış Kullanıcılar</strong><span>Organizasyon şemasına bağlanamayan kayıtlar</span></div>
          <div className="organization-unassigned-list">
            {unassignedProfiles.map((profile) => (
              <span key={profile.id}>
                {profile.full_name} · {profile.role === "manager" ? "Mağaza Müdürü" : "Çalışan"}
                {profile.is_on_leave ? " · İzinli" : ""}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
