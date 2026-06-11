import { requireAdminAccess } from "@/lib/auth/require-admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { formatPopupTargets, getAdminPopupAnnouncements, popupTargetOptions } from "@/lib/popup-announcements";
import {
  createPopupAnnouncementAction,
  deletePopupAnnouncementAction,
  togglePopupAnnouncementAction
} from "@/app/admin/bildirimler/actions";

type AdminPopupAnnouncementsPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

function formatLocalDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Istanbul"
  }).format(new Date(value));
}

function defaultDateTimeLocal(offsetHours: number) {
  const date = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const istanbulDate = new Date(date.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const year = istanbulDate.getFullYear();
  const month = String(istanbulDate.getMonth() + 1).padStart(2, "0");
  const day = String(istanbulDate.getDate()).padStart(2, "0");
  const hour = String(istanbulDate.getHours()).padStart(2, "0");
  const minute = String(istanbulDate.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export default async function AdminPopupAnnouncementsPage({ searchParams }: AdminPopupAnnouncementsPageProps) {
  const params = searchParams ? await searchParams : undefined;

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const announcements = await getAdminPopupAnnouncements();

  return (
    <main>
      <h1 className="page-title">Popup Bildirimler</h1>
      <p className="page-subtitle">
        Ana ekranda acilacak duyuruyu yazin, kimlerin gorecegini ve hangi tarih-saat araliginda gosterilecegini
        belirleyin.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <AdminSectionNav currentPath="/admin/bildirimler" />

      <section className="admin-card popup-admin-panel">
        <div className="section-title compact-title">
          <div>
            <h2>Yeni Popup Bildirim</h2>
            <p>Bildirim, belirlenen tarih ve saat araliginda kullanici her giris yaptiginda yeniden gorunur.</p>
          </div>
        </div>

        <form action={createPopupAnnouncementAction} className="popup-admin-form">
          <label className="field">
            <span>Baslik</span>
            <input name="title" placeholder="Ornek: Bugunun odak duyurusu" required />
          </label>

          <label className="field">
            <span>Bildirim Metni</span>
            <textarea
              className="text-area"
              name="body"
              placeholder="Kullanici ana ekrana geldiginde okuyacagi acik, kisa ve net mesaj..."
              rows={5}
              required
            />
          </label>

          <div className="popup-target-card">
            <strong>Kime gidecek?</strong>
            <p>Hic rol secmezsen tum onayli kullanicilar gorur.</p>
            <div className="popup-target-grid">
              {popupTargetOptions.map((option) => (
                <label key={option.value} className="popup-target-option">
                  <input name="targetRoles" type="checkbox" value={option.value} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="popup-date-grid">
            <label className="field">
              <span>Baslangic Tarih/Saat</span>
              <input name="showFrom" type="datetime-local" defaultValue={defaultDateTimeLocal(0)} required />
            </label>

            <label className="field">
              <span>Bitis Tarih/Saat</span>
              <input name="showUntil" type="datetime-local" defaultValue={defaultDateTimeLocal(24)} required />
            </label>
          </div>

          <button className="button-primary" type="submit">
            Bildirimi Yayina Al
          </button>
        </form>
      </section>

      <section className="popup-admin-list">
        <div className="section-title compact-title">
          <div>
            <h2>Kayitli Popup Bildirimler</h2>
            <p>Aktif/pasif yapabilir veya silebilirsiniz.</p>
          </div>
        </div>

        {announcements.length === 0 ? (
          <article className="admin-card">
            <strong>Henuz popup bildirim yok.</strong>
          </article>
        ) : (
          announcements.map((announcement) => (
            <article key={announcement.id} className="popup-admin-card">
              <div>
                <div className="popup-admin-card-head">
                  <strong>{announcement.title}</strong>
                  <span className={announcement.is_active ? "popup-status-active" : "popup-status-passive"}>
                    {announcement.is_active ? "Aktif" : "Pasif"}
                  </span>
                </div>
                <p>{announcement.body}</p>
                <div className="popup-admin-meta">
                  <span>{formatPopupTargets(announcement.target_roles)}</span>
                  <span>
                    {formatLocalDateTime(announcement.show_from)} - {formatLocalDateTime(announcement.show_until)}
                  </span>
                </div>
              </div>

              <div className="popup-admin-actions">
                <form action={togglePopupAnnouncementAction}>
                  <input type="hidden" name="id" value={announcement.id} />
                  <input type="hidden" name="isActive" value={String(announcement.is_active)} />
                  <button className="button-secondary" type="submit">
                    {announcement.is_active ? "Pasife Al" : "Aktif Et"}
                  </button>
                </form>

                <form action={deletePopupAnnouncementAction}>
                  <input type="hidden" name="id" value={announcement.id} />
                  <button className="button-secondary popup-delete-button" type="submit">
                    Sil
                  </button>
                </form>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
