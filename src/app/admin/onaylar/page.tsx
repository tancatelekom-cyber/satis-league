import {
  generateAndSendPasswordAction,
  setManagedProfilePasswordAction,
  updateManagedProfileAction
} from "@/app/admin/actions";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { getAdminDashboardData } from "@/lib/admin/get-admin-dashboard-data";
import { approvalLabels, roleLabels } from "@/lib/labels";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";
import { AdminManagedProfile, AdminPendingProfile, UserRole } from "@/lib/types";

type ApprovalAdminPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
    profile?: string;
  }>;
};

function formatLastLogin(value: string | null) {
  if (!value) {
    return "Hic giris yapmadi";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Bilinmiyor";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

export default async function ApprovalAdminPage({ searchParams }: ApprovalAdminPageProps) {
  const params = searchParams ? await searchParams : undefined;

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const data = await getAdminDashboardData();
  const roleOptions: UserRole[] = ["employee", "manager", "management", "admin"];
  const approvalOptions: Array<"pending" | "approved" | "rejected"> = ["pending", "approved", "rejected"];
  const storeOptions = data.storeRows.map((store) => ({ id: store.id, name: store.name }));
  const selectedManagedProfileId = String(params?.profile ?? "").trim();
  const activeManagedProfiles = data.managedProfileRows.filter(
    (profile) => profile.approval === "approved" && !profile.is_on_leave
  );
  const passiveManagedProfiles = data.managedProfileRows.filter(
    (profile) => profile.approval !== "approved" || profile.is_on_leave
  );
  const selectedManagedProfile =
    data.managedProfileRows.find((profile) => profile.id === selectedManagedProfileId) ?? null;
  const activeLoginRows = [...activeManagedProfiles].sort((left, right) => {
    const leftTime = left.last_sign_in_at ? new Date(left.last_sign_in_at).getTime() : 0;
    const rightTime = right.last_sign_in_at ? new Date(right.last_sign_in_at).getTime() : 0;
    return rightTime - leftTime;
  });
  const renderProfileEditor = (profile: AdminPendingProfile | AdminManagedProfile) => (
    <article key={profile.id} className="user-management-card">
      <form action={updateManagedProfileAction} className="user-management-form">
        <input name="redirectTo" type="hidden" value="/admin/onaylar" />
        <input name="profileId" type="hidden" value={profile.id} />

        <div className="user-management-head">
          <div>
            <strong>{profile.full_name}</strong>
            <span>{profile.email}</span>
          </div>
          <span className={`status-chip ${profile.approval === "approved" ? "approve" : ""}`}>
            {approvalLabels[profile.approval]}
          </span>
        </div>

        <div className="user-management-grid">
          <label className="field">
            <span>Ad Soyad</span>
            <input name="fullName" defaultValue={profile.full_name} required />
          </label>
          <label className="field">
            <span>Mail Adresi</span>
            <input name="email" type="email" defaultValue={profile.email} required />
          </label>
          <label className="field">
            <span>Telefon</span>
            <input name="phone" defaultValue={profile.phone ?? ""} />
          </label>
          <label className="field">
            <span>Rol</span>
            <select name="role" defaultValue={profile.role}>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Magaza</span>
            <select name="storeId" defaultValue={profile.store_id ?? ""}>
              <option value="">Magaza yok</option>
              {storeOptions.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Durum</span>
            <select name="approval" defaultValue={profile.approval}>
              {approvalOptions.map((approval) => (
                <option key={approval} value={approval}>
                  {approvalLabels[approval]}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-card user-management-check">
            <input name="isOnLeave" type="checkbox" defaultChecked={Boolean(profile.is_on_leave)} />
            <span>Izinli / listelerde pasif</span>
          </label>
          <div className="user-management-meta">
            <span>Son giris</span>
            <strong>{formatLastLogin(profile.last_sign_in_at)}</strong>
          </div>
        </div>

        <div className="action-row">
          <button className="tiny-button approve" type="submit">
            Bilgileri Kaydet
          </button>
        </div>
      </form>

      <form action={generateAndSendPasswordAction} className="user-password-form">
        <input name="redirectTo" type="hidden" value="/admin/onaylar" />
        <input name="profileId" type="hidden" value={profile.id} />
        <button className="tiny-button" type="submit">
          Yeni Sifre Uret ve Gonder
        </button>
      </form>

      <form action={setManagedProfilePasswordAction} className="user-manual-password-form">
        <input name="redirectTo" type="hidden" value="/admin/onaylar" />
        <input name="profileId" type="hidden" value={profile.id} />
        <label className="field">
          <span>Yeni Sifre Belirle</span>
          <input name="newPassword" type="text" minLength={8} placeholder="En az 8 karakter" required />
        </label>
        <label className="checkbox-card user-management-check">
          <input name="sendEmail" type="checkbox" defaultChecked />
          <span>Yeni sifreyi mail ile gonder</span>
        </label>
        <button className="tiny-button approve" type="submit">
          Sifreyi Degistir
        </button>
      </form>
    </article>
  );

  return (
    <main>
      <h1 className="page-title">Kullanici Yonetimi</h1>
      <p className="page-subtitle">
        Kullanici bilgilerini guncelleyin, durumlarini yonetin ve gerekirse yeni sifre uretip mail adreslerine gonderin.
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
              data.approvalRows.map((approval) => renderProfileEditor(approval))
            )}
          </div>
        </article>

        <article className="admin-card">
          <h3>Aktif ve Pasif Kullanicilar</h3>
          {data.managedProfileRows.length === 0 ? (
            <div className="approval-list">
              <div className="step-item">
                <strong>Kullanici bulunamadi</strong>
                <span>Onaylanan veya pasife alinan kullanicilar burada listelenir.</span>
              </div>
            </div>
          ) : (
            <div className="user-management-browser">
              <section className="user-management-group">
                <div className="user-management-group-head">
                  <div>
                    <h4>Aktif Kullanicilar</h4>
                    <p>Onayli ve aktif listede olan ekip.</p>
                  </div>
                  <span className="status-chip approve">{activeManagedProfiles.length}</span>
                </div>
                <div className="user-management-pill-list">
                  {activeManagedProfiles.map((profile) => (
                    <a
                      key={profile.id}
                      className={`user-management-pill ${selectedManagedProfileId === profile.id ? "user-management-pill-active" : ""}`}
                      href={`/admin/onaylar?profile=${profile.id}#managed-editor`}
                    >
                      {profile.full_name}
                    </a>
                  ))}
                </div>
              </section>

              <section className="user-management-group">
                <div className="user-management-group-head">
                  <div>
                    <h4>Pasif Kullanicilar</h4>
                    <p>Pasife alinan, reddedilen veya izinli kullanicilar.</p>
                  </div>
                  <span className="status-chip">{passiveManagedProfiles.length}</span>
                </div>
                <div className="user-management-pill-list">
                  {passiveManagedProfiles.map((profile) => (
                    <a
                      key={profile.id}
                      className={`user-management-pill ${selectedManagedProfileId === profile.id ? "user-management-pill-active" : ""}`}
                      href={`/admin/onaylar?profile=${profile.id}#managed-editor`}
                    >
                      {profile.full_name}
                    </a>
                  ))}
                </div>
              </section>

              <section id="managed-editor" className="user-management-detail-shell">
                <div className="user-management-group-head">
                  <div>
                    <h4>Secili Kullanici</h4>
                    <p>Listeden bir isim secince degistirme alanlari burada acilir.</p>
                  </div>
                </div>
                {selectedManagedProfile ? (
                  renderProfileEditor(selectedManagedProfile)
                ) : (
                  <div className="step-item">
                    <strong>Kullanici secilmedi</strong>
                    <span>Yukaridaki aktif veya pasif listeden bir kullanici secin.</span>
                  </div>
                )}
              </section>
            </div>
          )}
        </article>

        <article className="admin-card">
          <div className="user-management-group-head">
            <div>
              <h3>Aktif Kullanicilar Son Giris Listesi</h3>
              <p>Son giris tarih ve saatlerini buradan takip edin ve Excele indirin.</p>
            </div>
            <a className="button-primary" href="/admin/onaylar/excel">
              Excele Indir
            </a>
          </div>

          {activeLoginRows.length === 0 ? (
            <div className="step-item">
              <strong>Aktif kullanici bulunamadi</strong>
              <span>Son giris listesi aktif kullanicilar oldugunda burada gorunur.</span>
            </div>
          ) : (
            <div className="user-login-table-wrap">
              <table className="user-login-table">
                <thead>
                  <tr>
                    <th>Kullanici</th>
                    <th>Rol</th>
                    <th>Magaza</th>
                    <th>Son Giris</th>
                  </tr>
                </thead>
                <tbody>
                  {activeLoginRows.map((profile) => (
                    <tr key={profile.id}>
                      <td>{profile.full_name}</td>
                      <td>{roleLabels[profile.role]}</td>
                      <td>{profile.store?.name ?? "Merkez"}</td>
                      <td>{formatLastLogin(profile.last_sign_in_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
