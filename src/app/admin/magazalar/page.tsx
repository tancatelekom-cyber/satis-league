import {
  createStoreAction,
  toggleStoreStatusAction,
  updateStoreAction
} from "@/app/admin/actions";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { getAdminDashboardData } from "@/lib/admin/get-admin-dashboard-data";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";

type StoreAdminPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

export default async function StoreAdminPage({ searchParams }: StoreAdminPageProps) {
  const params = searchParams ? await searchParams : undefined;

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const data = await getAdminDashboardData();

  return (
    <main>
      <h1 className="page-title">Magaza Yonetimi</h1>
      <p className="page-subtitle">
        Kayit ekraninda hangi magazalar gorunsun, hangileri pasif kalsin buradan yonetin.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <AdminSectionNav currentPath="/admin/magazalar" />

      <section className="admin-stack">
        <article className="admin-card">
          <h3>Magaza Ekle</h3>
          <form action={createStoreAction} className="admin-form">
            <input name="redirectTo" type="hidden" value="/admin/magazalar" />
            <div className="auth-grid">
              <label className="field">
                <span>Magaza Adi</span>
                <input name="name" placeholder="Ornek: Cevahir AVM" required />
              </label>
              <label className="field">
                <span>Sehir</span>
                <input name="city" placeholder="Ornek: Istanbul" />
              </label>
              <label className="field">
                <span>Temel Puan Carpani</span>
                <input defaultValue="1" name="baseMultiplier" step="0.01" type="number" />
              </label>
            </div>

            <div className="auth-actions">
              <button className="button-primary" type="submit">
                Magazayi Kaydet
              </button>
            </div>
          </form>
        </article>

        <article className="admin-card">
          <h3>Magaza Listesi</h3>
          <div className="store-admin-list">
            {data.storeRows.map((store) => (
              <div key={store.id} className="store-admin-row">
                <form action={updateStoreAction} className="store-edit-form">
                  <input name="redirectTo" type="hidden" value="/admin/magazalar" />
                  <input name="id" type="hidden" value={store.id} />

                  <label className="field compact">
                    <span>Magaza</span>
                    <input defaultValue={store.name} name="name" required />
                  </label>

                  <label className="field compact">
                    <span>Sehir</span>
                    <input defaultValue={store.city ?? ""} name="city" />
                  </label>

                  <label className="field compact">
                    <span>Carpan</span>
                    <input
                      defaultValue={String(store.base_multiplier)}
                      name="baseMultiplier"
                      step="0.01"
                      type="number"
                    />
                  </label>

                  <div className="store-status">
                    <span>Durum</span>
                    <strong>{store.is_active ? "Aktif" : "Pasif"}</strong>
                  </div>

                  <div className="action-row">
                    <button className="tiny-button approve" type="submit">
                      Guncelle
                    </button>
                  </div>
                </form>

                <form action={toggleStoreStatusAction}>
                  <input name="redirectTo" type="hidden" value="/admin/magazalar" />
                  <input name="id" type="hidden" value={store.id} />
                  <input name="isActive" type="hidden" value={String(store.is_active)} />
                  <button className="tiny-button" type="submit">
                    {store.is_active ? "Pasif Yap" : "Tekrar Aktif Et"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
