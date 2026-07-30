import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RequestStatus, RequestType, UserRole } from "@/lib/types";
import { RequestCreateForm } from "@/components/requests/request-create-form";
import { approveRequestAction, completeRequestAction, deleteRequestAction, rejectRequestAction } from "./actions";

const IMPLEMENTER_ID = "7998f539-5077-472b-ba65-a1d45533eafa";
const ADMIN_REQUEST_APPROVER_ID = "de688a42-d22a-48fa-b86f-32552bf2e1ac";
const COORDINATOR_ID = "b3df7df9-b781-4ba0-8829-97a3aa790229";

type Profile = { id: string; full_name: string; role: UserRole; approval: string; store_id: string | null };
type NotificationProfile = {
  id: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  store_id: string | null;
};
type RequestItem = {
  id: string; requester_id: string; store_id: string | null; request_type: RequestType; title: string;
  description: string | null; start_date: string | null; end_date: string | null; advance_amount: number | null;
  start_time: string | null; end_time: string | null;
  collection_method: string | null; status: RequestStatus; current_assignee_id: string | null;
  rejected_by: string | null; rejection_stage: "manager" | "suitability" | "coordinator" | "implementation" | null;
  rejection_reason: string | null; created_at: string; manager_approved_at: string | null;
  suitability_approved_at: string | null; admin_approved_at: string | null; implemented_at: string | null;
  requester: { full_name: string } | null; rejectedBy: { full_name: string } | null; store: { name: string } | null;
};
type PageProps = { searchParams?: Promise<{ view?: string; message?: string; type?: string }> };

const statusLabels: Record<RequestStatus, string> = {
  manager_pending: "Mağaza müdürü onayı bekliyor",
  suitability_pending: "Uygunluk onayı bekliyor",
  admin_pending: "Koordinatör onayı bekliyor",
  implementation_pending: "Uygulama bekliyor",
  completed: "Uygulandı",
  rejected: "Reddedildi"
};

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`)) : "—";
}

function formatDateTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("tr-TR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Istanbul"
      }).format(new Date(value))
    : "—";
}

function normalizeWhatsAppPhone(value: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("90") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `90${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 10) return `90${digits}`;
  return digits;
}

export default async function RequestsPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id, full_name, role, approval, store_id").eq("id", user.id).single<Profile>();
  if (!profile || profile.approval !== "approved") redirect("/giris");

  let query = admin.from("employee_requests")
    .select("id, requester_id, store_id, request_type, title, description, start_date, end_date, start_time, end_time, advance_amount, collection_method, status, current_assignee_id, rejected_by, rejection_stage, rejection_reason, created_at, manager_approved_at, suitability_approved_at, admin_approved_at, implemented_at, requester:profiles!employee_requests_requester_id_fkey(full_name), rejectedBy:profiles!employee_requests_rejected_by_fkey(full_name), store:stores(name)")
    .order("created_at", { ascending: false });

  if (profile.id === ADMIN_REQUEST_APPROVER_ID || profile.id === IMPLEMENTER_ID) {
    // Özel yönetici kullanıcıları tüm talep akışını ve sonuçlarını görebilir.
  } else if (profile.role === "employee") query = query.eq("requester_id", profile.id);
  else if (profile.role === "manager") {
    const { data: branchEmployees } = await admin
      .from("profiles")
      .select("id")
      .eq("store_id", profile.store_id ?? "00000000-0000-0000-0000-000000000000")
      .eq("role", "employee")
      .eq("approval", "approved");
    const visibleRequesterIds = [profile.id, ...(branchEmployees ?? []).map((employee) => employee.id)];
    query = query.in("requester_id", visibleRequesterIds);
  } else if (profile.role === "management") query = query.eq("requester_id", profile.id);

  const { data, error } = await query;
  const requests = (data ?? []) as unknown as RequestItem[];
  const { data: notificationProfilesData } = await admin
    .from("profiles")
    .select("id, full_name, phone, role, store_id")
    .eq("approval", "approved");
  const notificationProfiles = (notificationProfilesData ?? []) as NotificationProfile[];
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
        <RequestCreateForm />
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
                  || (!item.current_assignee_id && profile.id === COORDINATOR_ID)
                );
              const canComplete = item.status === "implementation_pending" && profile.id === IMPLEMENTER_ID;
              const canSuitabilityApprove = item.status === "suitability_pending" && profile.id === IMPLEMENTER_ID;
              const notificationRecipient = item.status === "manager_pending"
                ? notificationProfiles.find((candidate) => candidate.role === "manager" && candidate.store_id === item.store_id)
                : item.current_assignee_id
                  ? notificationProfiles.find((candidate) => candidate.id === item.current_assignee_id)
                  : null;
              const notificationPhone = normalizeWhatsAppPhone(notificationRecipient?.phone ?? null);
              const whatsappMessage = notificationRecipient
                ? encodeURIComponent(
                    `Merhaba ${notificationRecipient.full_name}, ${item.requester?.full_name ?? "bir kullanıcı"} tarafından oluşturulan ${item.title} onayınızı bekliyor. TANCA+ uygulamasındaki Talepler menüsünden inceleyebilirsiniz.`
                  )
                : "";
              return (
                <article className="request-card" key={item.id}>
                  <header>
                    <div><span className="request-type">{item.title}</span><h2>{item.requester?.full_name ?? "Kullanıcı"}</h2><p>{item.store?.name ?? "Mağaza belirtilmedi"} · {formatDateTime(item.created_at)}</p></div>
                    <span className={`request-status request-status-${item.status}`}>{statusLabels[item.status]}</span>
                  </header>
                  <div className="request-details">
                    {["annual_leave", "excuse_leave"].includes(item.request_type) ? <p><strong>İzin başlangıcı:</strong> {formatDate(item.start_date)} · <strong>İş başı tarihi:</strong> {formatDate(item.end_date)}</p> : null}
                    {item.start_time && item.end_time ? <p><strong>Saat aralığı:</strong> {item.start_time.slice(0, 5)} – {item.end_time.slice(0, 5)}</p> : null}
                    {item.request_type === "advance" ? <p><strong>İhtiyaç tarihi:</strong> {formatDate(item.start_date)}</p> : null}
                    {item.request_type === "advance" ? <p><strong>Tutar:</strong> ₺{Number(item.advance_amount ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</p> : null}
                    {item.collection_method ? <p><strong>Tahsilat:</strong> {item.collection_method}</p> : null}
                    {item.description ? <p className="request-description"><strong>Açıklama:</strong> {item.description}</p> : null}
                    {item.rejectedBy?.full_name ? <p className="request-rejection"><strong>Reddeden:</strong> {item.rejectedBy.full_name}</p> : null}
                    {item.rejection_reason ? <p className="request-rejection"><strong>Red nedeni:</strong> {item.rejection_reason}</p> : null}
                  </div>
                  <ol className="request-flow request-flow-four">
                    <li className={item.rejection_stage === "manager" ? "rejected" : item.manager_approved_at || item.status !== "manager_pending" ? "done" : "active"}>Müdür onayı</li>
                    <li className={item.rejection_stage === "suitability" ? "rejected" : item.suitability_approved_at || ["admin_pending", "implementation_pending", "completed"].includes(item.status) ? "done" : item.status === "suitability_pending" ? "active" : ""}>Uygunluk onayı</li>
                    <li className={item.rejection_stage === "coordinator" ? "rejected" : item.admin_approved_at || ["implementation_pending", "completed"].includes(item.status) ? "done" : item.status === "admin_pending" ? "active" : ""}>Koordinatör onayı</li>
                    <li className={item.rejection_stage === "implementation" ? "rejected" : item.status === "completed" ? "done" : item.status === "implementation_pending" ? "active" : ""}>Uygulama</li>
                  </ol>
                  {canManagerDecide || canAdminDecide || canSuitabilityApprove ? (
                    <div className="request-actions">
                      <form action={approveRequestAction} className="request-approve-form">
                        <input type="hidden" name="requestId" value={item.id} />
                        {canSuitabilityApprove && item.request_type === "advance" ? (
                          <details className="request-adjust-details">
                            <summary>Yeni tarih / tutar belirle</summary>
                            <div>
                              <label>Yeni ihtiyaç tarihi<input name="adjustedNeededDate" type="date" /></label>
                              <label>Yeni tutar (₺)<input name="adjustedAmount" type="number" min="1" step="0.01" placeholder={String(item.advance_amount ?? "")} /></label>
                            </div>
                          </details>
                        ) : null}
                        <button className="request-approve-button" type="submit">{canAdminDecide ? "Koordinatör Onayı Yap" : "Onayla"}</button>
                      </form>
                      <form action={rejectRequestAction} className="request-reject-form"><input type="hidden" name="requestId" value={item.id} /><input name="reason" aria-label="Red nedeni" placeholder="Red nedeni" /><button className="request-reject-button" type="submit">Reddet</button></form>
                    </div>
                  ) : null}
                  {canComplete ? <form action={completeRequestAction} className="request-actions"><input type="hidden" name="requestId" value={item.id} /><button className="request-complete-button" type="submit">Uygulandı</button></form> : null}
                  {notificationPhone ? (
                    <a
                      className="request-whatsapp-button"
                      href={`https://wa.me/${notificationPhone}?text=${whatsappMessage}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp’tan bildir
                    </a>
                  ) : null}
                  {profile.role === "admin" ? <form action={deleteRequestAction} className="request-delete-form"><input type="hidden" name="requestId" value={item.id} /><button className="request-delete-button" type="submit">Talebi sil</button></form> : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
