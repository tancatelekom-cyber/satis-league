import { updateApprovalAction } from "@/app/admin/actions";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { getAdminDashboardData } from "@/lib/admin/get-admin-dashboard-data";
import { roleLabels } from "@/lib/labels";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";

type ApprovalAdminPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

export default async function ApprovalAdminPage({ searchParams }: ApprovalAdminPageProps) {
  const params = searchParams ? await searchParams : undefined;

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const data = await getAdminDashboardData();

  return (
    <main>
      <h1 className="page-title">Kullanici Onaylari</h1>
      <p className="page-subtitle">
        Kayit olan kullanicilar once burada bekler. Onay verirseniz sisteme aktif olarak girerler.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <AdminSectionNav currentPath="/admin/onaylar" />

      <section className="admin-stack">
        <article className="admin-card">
          <h3>Bekleyen Kayit Onaylari</h3>
          <div className="approval-list">
            {data.approvalRows.length === 0 ? (
              <div className="step-item">
                <strong>Bekleyen kayit yok</strong>
                <span>Yeni kullanici kayit olunca burada gorunecek.</span>
              </div>
            ) : (
              data.approvalRows.map((approval) => (
                <div key={approval.id} className="approval-row">
                  <div>
                    <h4>{approval.full_name}</h4>
                    <p>
                      {approval.store?.name ?? "Magaza yok"} | {approval.phone ?? "-"}
                    </p>
                    <p className="subtle">
                      Rol: {roleLabels[approval.role]} | Mail: {approval.email}
                    </p>
                  </div>

                  <div className="action-row">
                    <form action={updateApprovalAction}>
                      <input name="redirectTo" type="hidden" value="/admin/onaylar" />
                      <input name="profileId" type="hidden" value={approval.id} />
                      <input name="approval" type="hidden" value="approved" />
                      <button className="tiny-button approve" type="submit">
                        Onayla
                      </button>
                    </form>

                    <form action={updateApprovalAction}>
                      <input name="redirectTo" type="hidden" value="/admin/onaylar" />
                      <input name="profileId" type="hidden" value={approval.id} />
                      <input name="approval" type="hidden" value="rejected" />
                      <button className="tiny-button" type="submit">
                        Reddet
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="admin-card">
          <h3>Aktif ve Pasif Kullanicilar</h3>
          <div className="approval-list">
            {data.managedProfileRows.length === 0 ? (
              <div className="step-item">
                <strong>Kullanici bulunamadi</strong>
                <span>Onaylanan veya pasife alinan kullanicilar burada listelenir.</span>
              </div>
            ) : (
              data.managedProfileRows.map((profile) => (
                <div key={profile.id} className="approval-row">
                  <div>
                    <h4>{profile.full_name}</h4>
                    <p>
                      {profile.store?.name ?? "Magaza yok"} | {profile.phone ?? "-"}
                    </p>
                    <p className="subtle">
                      Rol: {roleLabels[profile.role]} | Mail: {profile.email}
                    </p>
                    <p className="subtle">
                      Durum: {profile.approval === "approved" ? "Aktif" : "Pasif"}
                      {profile.is_on_leave ? " | Izinli" : ""}
                    </p>
                  </div>

                  <div className="action-row">
                    <form action={updateApprovalAction}>
                      <input name="redirectTo" type="hidden" value="/admin/onaylar" />
                      <input name="profileId" type="hidden" value={profile.id} />
                      <input
                        name="approval"
                        type="hidden"
                        value={profile.approval === "approved" ? "rejected" : "approved"}
                      />
                      <button
                        className={`tiny-button ${profile.approval === "approved" ? "" : "approve"}`}
                        type="submit"
                      >
                        {profile.approval === "approved" ? "Pasife Al" : "Tekrar Aktif Et"}
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
