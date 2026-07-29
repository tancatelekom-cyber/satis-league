import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RequestStatus, RequestType, UserRole } from "@/lib/types";
import { approveRequestAction, completeRequestAction, createRequestAction, rejectRequestAction } from "./actions";

const IMPLEMENTER_ID = "7998f539-5077-472b-ba65-a1d45533eafa";
const ADMIN_REQUEST_APPROVER_ID = "de688a42-d22a-48fa-b86f-32552bf2e1ac";

type Profile = { id: string; full_name: string; role: UserRole; approval: string; store_id: string | null };
type RequestItem = {
  id: string; requester_id: string; store_id: string | null; request_type: RequestType; title: string;
  description: string | null; start_date: string | null; end_date: string | null; advance_amount: number | null;
  collection_method: string | null; status: RequestStatus; current_assignee_id: string | null;
  rejection_reason: string | null; created_at: string; manager_approved_at: string | null;
  admin_approved_at: string | null; implemented_at: string | null;
  requester: { full_name: string } | null; store: { name: string } | null;
};
type PageProps = { searchParams?: Promise<{ view?: string; message?: string; type?: string }> };

const statusLabels: Record<RequestStatus, string> = {
  manager_pending: "Mağaza müdürü onayı bekliyor",
  admin_pending: "Admin onayı bekliyor",
  implementation_pending: "Uygulama bekliyor",
  completed: "Uygulandı",
  rejected: "Reddedildi"
};

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`)) : "—";
}

function formatDateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

export default async function RequestsPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id, full_name, role, approval, store_id").eq("id", user.id).single<Profile>();
  if (!profile || profile.approval !== "approved") redirect("/giris");

  let query = admin.from("employee_requests")
    .select("id, requester_id, store_id, request_type, title, description, start_date, end_date, advance_amount, collection_method, status, current_assignee_id, rejection_reason, created_at, manager_approved_at, admin_approved_at, implemented_at, requester:profiles!employee_requests_requester_id_fkey(full_name), store:stores(name)")
    .order("created_at", { ascending: false });

  if (profile.id === ADMIN_REQUEST_APPROVER_ID) {
    // Özel onay kullanıcısı tüm talep akışını ve sonuçlarını görebilir.
  } else if (profile.id === IMPLEMENTER_ID) {
    query = query.or(`requester_id.eq.${profile.id},current_assignee_id.eq.${profile.id}`);
  } else if (profile.role === "employee") query = query.eq("requester_id", profile.id);
  else if (profile.role === "manager") query = query.eq("store_id", profile.store_id ?? "00000000-0000-0000-0000-000000000000");

  const { data, error } = await query;
  const requests = (data ?? []) as unknown as RequestItem[];
  const showCompleted = params.view === "completed";
  const visible = requests.filter((item) => showCompleted
    ? ["completed", "rejected"].includes(item.status)
    : !["completed", "rejected"].includes(item.status));

  return (
    <main className="request-page">
      <section className="request-hero">
        <div><span className="request-eyebrow">TALEP MERKEZİ</span><h1>Talep oluştur ve süreci takip et</h1><p>İzin ve avans taleplerini oluştur; tüm onay adımlarını tek ekrandan izle.</p></div>
        <span className="request-hero-icon" aria-hidden="true">📨</span>
      </section>

      {params.message ? <p className={`request-message request-message-${params.type === "error" ? "error" : "success"}`}>{params.message}</p> : null}
      {error ? <p className="request-message request-message-error">Talep veri tabanı kurulumu gerekiyor: {error.message}</p> : null}

      <section className="request-create-card">
        <div className="request-section-heading"><span>YENİ TALEP</span><h2>Talep oluştur</h2></div>
        <form action={createRequestAction} className="request-form">
          <label>Talep türü<select name="requestType" required defaultValue="annual_leave"><option value="annual_leave">Yıllık izin</option><option value="excuse_leave">Mazeret izni</option><option value="advance">Avans</option><option value="other">Diğer</option></select></label>
          <label>Diğer talep başlığı<input name="customTitle" type="text" maxLength={120} placeholder="Örn. ekipman talebi" /></label>
          <label>Başlangıç tarihi<input name="startDate" type="date" /></label>
          <label>Bitiş tarihi<input name="endDate" type="date" /></label>
          <label>Avans miktarı (₺)<input name="advanceAmount" type="number" min="1" step="0.01" placeholder="Örn. 5000" /></label>
          <label>Tahsilat şekli<select name="collectionMethod" defaultValue=""><option value="">Seçiniz</option><option value="Maaştan kesinti">Maaştan kesinti</option><option value="Primden kesinti">Primden kesinti</option><option value="Maaş ve primden kesinti">Maaş ve primden kesinti</option></select></label>
          <label className="request-form-wide">Açıklama / mazeret<textarea name="description" rows={3} placeholder="Talebinizle ilgili açıklama ekleyin." /></label>
          <button className="request-primary-button" type="submit">Talebi oluştur</button>
        </form>
        <p className="request-form-note">İzin taleplerinde tarihleri; avans talebinde miktar ve tahsilat şeklini doldurun.</p>
      </section>

      <section className="request-list-section">
        <div className="request-tabs">
          <a className={!showCompleted ? "request-tab-active" : ""} href="/talepler">Açık talepler</a>
          <a className={showCompleted ? "request-tab-active" : ""} href="/talepler?view=completed">Sonuçlandı</a>
        </div>

        {visible.length === 0 ? <div className="request-empty"><span>📭</span><h2>Bu kategoride talep yok</h2><p>Yeni hareketler burada görüntülenecek.</p></div> : (
          <div className="request-card-list">
            {visible.map((item) => {
              const canManagerDecide = item.status === "manager_pending" && profile.role === "manager" && profile.store_id === item.store_id;
              const canAdminDecide = item.status === "admin_pending"
                && (
                  (item.current_assignee_id && item.current_assignee_id === profile.id)
                  || (!item.current_assignee_id && profile.role === "admin")
                );
              const canComplete = item.status === "implementation_pending" && profile.id === IMPLEMENTER_ID;
              return (
                <article className="request-card" key={item.id}>
                  <header>
                    <div><span className="request-type">{item.title}</span><h2>{item.requester?.full_name ?? "Kullanıcı"}</h2><p>{item.store?.name ?? "Mağaza belirtilmedi"} · {formatDateTime(item.created_at)}</p></div>
                    <span className={`request-status request-status-${item.status}`}>{statusLabels[item.status]}</span>
                  </header>
                  <div className="request-details">
                    {["annual_leave", "excuse_leave"].includes(item.request_type) ? <p><strong>Tarih:</strong> {formatDate(item.start_date)} – {formatDate(item.end_date)}</p> : null}
                    {item.request_type === "advance" ? <p><strong>Tutar:</strong> ₺{Number(item.advance_amount ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</p> : null}
                    {item.collection_method ? <p><strong>Tahsilat:</strong> {item.collection_method}</p> : null}
                    {item.description ? <p className="request-description"><strong>Açıklama:</strong> {item.description}</p> : null}
                    {item.rejection_reason ? <p className="request-rejection"><strong>Red nedeni:</strong> {item.rejection_reason}</p> : null}
                  </div>
                  <ol className="request-flow">
                    <li className={item.manager_approved_at || item.status !== "manager_pending" ? "done" : "active"}>Müdür onayı</li>
                    <li className={item.admin_approved_at || ["implementation_pending", "completed"].includes(item.status) ? "done" : item.status === "admin_pending" ? "active" : ""}>Admin onayı</li>
                    <li className={item.status === "completed" ? "done" : item.status === "implementation_pending" ? "active" : ""}>Uygulama</li>
                  </ol>
                  {canManagerDecide || canAdminDecide ? (
                    <div className="request-actions">
                      <form action={approveRequestAction}><input type="hidden" name="requestId" value={item.id} /><button className="request-approve-button" type="submit">Onayla</button></form>
                      <form action={rejectRequestAction} className="request-reject-form"><input type="hidden" name="requestId" value={item.id} /><input name="reason" aria-label="Red nedeni" placeholder="Red nedeni" /><button className="request-reject-button" type="submit">Reddet</button></form>
                    </div>
                  ) : null}
                  {canComplete ? <form action={completeRequestAction} className="request-actions"><input type="hidden" name="requestId" value={item.id} /><button className="request-complete-button" type="submit">Uygulandı</button></form> : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
