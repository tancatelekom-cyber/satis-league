import Link from "next/link";
import { redirect } from "next/navigation";
import { markNotificationsReadAction } from "@/app/bildirimler/actions";
import { formatCampaignDateTime } from "@/lib/campaign-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NotificationRecord } from "@/lib/types";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: notifications } = await admin
    .from("notifications")
    .select("id, title, body, level, link_path, read_at, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const rows = (notifications as NotificationRecord[] | null) ?? [];
  const unreadCount = rows.filter((row) => !row.read_at).length;

  return (
    <main>
      <h1 className="page-title">Bildirim Merkezi</h1>
      <p className="page-subtitle">
        Kampanya acilislariniz, onaylariniz ve skor hareketleri burada toplanir.
      </p>

      <section className="campaign-layout">
        <article className="campaign-card">
          <div className="campaign-header">
            <div>
              <div className="status-chip">{unreadCount} okunmamis bildirim</div>
              <h2>Son hareketler</h2>
              <p>Yeni kampanya, skor ve onay mesajlariniz bu alanda birikir.</p>
            </div>

            <form action={markNotificationsReadAction}>
              <button className="button-secondary" type="submit">
                Tumunu Okundu Yap
              </button>
            </form>
          </div>

          <div className="notification-list">
            {rows.length > 0 ? (
              rows.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${notification.read_at ? "read" : "unread"} ${notification.level}`}
                >
                  <div>
                    <strong>{notification.title}</strong>
                    <p>{notification.body}</p>
                    <span className="subtle">{formatCampaignDateTime(notification.created_at)}</span>
                  </div>
                  <div className="notification-actions">
                    {notification.link_path ? (
                      <Link className="tiny-button approve" href={notification.link_path}>
                        Ac
                      </Link>
                    ) : null}
                    {!notification.read_at ? (
                      <form action={markNotificationsReadAction}>
                        <input name="notificationId" type="hidden" value={notification.id} />
                        <button className="tiny-button" type="submit">
                          Okundu
                        </button>
                      </form>
                    ) : (
                      <span className="subtle">Okundu</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="step-item">
                <strong>Henuz bildirim yok</strong>
                <span>Ilk kampanya acildiginda veya skor islendiginizde burada gorunecek.</span>
              </div>
            )}
          </div>
        </article>

        <aside className="leaderboard-card">
          <h3>Ne zaman gelir?</h3>
          <div className="step-list">
            <div className="step-item">
              <strong>Yeni kampanya</strong>
              <span>Admin kampanya actiginda bildirim duser.</span>
            </div>
            <div className="step-item">
              <strong>Skor isleme</strong>
              <span>Satis girdiginizde puan etkisi aninda yazilir.</span>
            </div>
            <div className="step-item">
              <strong>Onay ve sonuclanma</strong>
              <span>Hesap onayi ve kampanya kapanisinda da mesaj gelir.</span>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
