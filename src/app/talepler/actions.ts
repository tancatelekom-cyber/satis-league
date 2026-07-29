"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RequestStatus, RequestType, UserRole } from "@/lib/types";

const IMPLEMENTER_ID = "7998f539-5077-472b-ba65-a1d45533eafa";
const ADMIN_REQUEST_APPROVER_ID = "de688a42-d22a-48fa-b86f-32552bf2e1ac";
const REQUEST_PATH = "/talepler";

type Actor = { id: string; role: UserRole; approval: string; store_id: string | null };
type RequestRow = {
  id: string;
  requester_id: string;
  store_id: string | null;
  status: RequestStatus;
  current_assignee_id: string | null;
};

function go(message: string, type: "success" | "error" = "success"): never {
  redirect(`${REQUEST_PATH}?${new URLSearchParams({ message, type })}`);
}

async function getActor(): Promise<Actor> {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id, role, approval, store_id").eq("id", user.id).single<Actor>();
  if (!data || data.approval !== "approved") redirect("/giris");
  return data;
}

function parseRequestType(value: string): RequestType | null {
  return ["annual_leave", "excuse_leave", "advance", "other"].includes(value) ? value as RequestType : null;
}

export async function createRequestAction(formData: FormData) {
  const actor = await getActor();
  const type = parseRequestType(String(formData.get("requestType") ?? ""));
  const description = String(formData.get("description") ?? "").trim();
  const customTitle = String(formData.get("customTitle") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim() || null;
  const endDate = String(formData.get("endDate") ?? "").trim() || null;
  const amountText = String(formData.get("advanceAmount") ?? "").replace(",", ".").trim();
  const collectionMethod = String(formData.get("collectionMethod") ?? "").trim() || null;

  if (!type) go("Talep türü seçilmedi.", "error");
  if (["annual_leave", "excuse_leave"].includes(type) && (!startDate || !endDate)) go("İzin başlangıç ve bitiş tarihlerini girin.", "error");
  if (type === "other" && !customTitle) go("Diğer talep için talep başlığını girin.", "error");
  if (startDate && endDate && endDate < startDate) go("Bitiş tarihi başlangıçtan önce olamaz.", "error");

  const advanceAmount = type === "advance" ? Number(amountText) : null;
  if (type === "advance" && (!Number.isFinite(advanceAmount) || Number(advanceAmount) <= 0 || !collectionMethod)) {
    go("Avans miktarı ve tahsilat şeklini eksiksiz girin.", "error");
  }

  const status: RequestStatus = actor.role === "employee"
    ? "manager_pending"
    : "admin_pending";

  const admin = createAdminClient();
  const { error } = await admin.from("employee_requests").insert({
    requester_id: actor.id,
    store_id: actor.store_id,
    request_type: type,
    title: type === "annual_leave"
      ? "Yıllık İzin Talebi"
      : type === "excuse_leave"
        ? "Mazeret İzni Talebi"
        : type === "advance"
          ? "Avans Talebi"
          : customTitle,
    description: description || null,
    start_date: ["annual_leave", "excuse_leave"].includes(type) ? startDate : null,
    end_date: ["annual_leave", "excuse_leave"].includes(type) ? endDate : null,
    advance_amount: advanceAmount,
    collection_method: type === "advance" ? collectionMethod : null,
    status,
    current_assignee_id: actor.role === "admin" ? ADMIN_REQUEST_APPROVER_ID : null
  });

  if (error) go(`Talep oluşturulamadı: ${error.message}`, "error");
  revalidatePath(REQUEST_PATH);
  go("Talebiniz oluşturuldu.");
}

export async function approveRequestAction(formData: FormData) {
  const actor = await getActor();
  const requestId = String(formData.get("requestId") ?? "").trim();
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("employee_requests")
    .select("id, requester_id, store_id, status, current_assignee_id")
    .eq("id", requestId)
    .single<RequestRow>();

  if (!request) go("Talep bulunamadı.", "error");
  const now = new Date().toISOString();
  let update: Record<string, string | null> | null = null;

  if (request.status === "manager_pending" && actor.role === "manager" && actor.store_id === request.store_id) {
    update = { status: "admin_pending", manager_approved_by: actor.id, manager_approved_at: now, current_assignee_id: null, updated_at: now };
  } else if (
    request.status === "admin_pending"
    && (
      (request.current_assignee_id && request.current_assignee_id === actor.id)
      || (!request.current_assignee_id && actor.role === "admin")
    )
  ) {
    update = { status: "implementation_pending", admin_approved_by: actor.id, admin_approved_at: now, current_assignee_id: IMPLEMENTER_ID, updated_at: now };
  }

  if (!update) go("Bu talebi onaylama yetkiniz yok.", "error");
  const { error } = await admin.from("employee_requests").update(update).eq("id", request.id).eq("status", request.status);
  if (error) go(`Talep onaylanamadı: ${error.message}`, "error");
  revalidatePath(REQUEST_PATH);
  go("Talep onaylandı ve sonraki adıma gönderildi.");
}

export async function rejectRequestAction(formData: FormData) {
  const actor = await getActor();
  const requestId = String(formData.get("requestId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("employee_requests")
    .select("id, requester_id, store_id, status, current_assignee_id")
    .eq("id", requestId)
    .single<RequestRow>();

  if (!request || !["manager_pending", "admin_pending"].includes(request.status)) go("Talep artık reddedilemez.", "error");
  const allowed =
    (request.status === "manager_pending" && actor.role === "manager" && actor.store_id === request.store_id)
    || (
      request.status === "admin_pending"
      && (
        (request.current_assignee_id && request.current_assignee_id === actor.id)
        || (!request.current_assignee_id && actor.role === "admin")
      )
    );
  if (!allowed) go("Bu talebi reddetme yetkiniz yok.", "error");

  const now = new Date().toISOString();
  const { error } = await admin.from("employee_requests").update({
    status: "rejected",
    current_assignee_id: null,
    rejected_by: actor.id,
    rejected_at: now,
    rejection_reason: reason || "Talep uygun bulunmadı.",
    updated_at: now
  }).eq("id", request.id).eq("status", request.status);
  if (error) go(`Talep reddedilemedi: ${error.message}`, "error");
  revalidatePath(REQUEST_PATH);
  go("Talep reddedildi.");
}

export async function completeRequestAction(formData: FormData) {
  const actor = await getActor();
  const requestId = String(formData.get("requestId") ?? "").trim();
  if (actor.id !== IMPLEMENTER_ID) go("Bu işlemi yalnızca uygulayıcı tamamlayabilir.", "error");

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("employee_requests").update({
    status: "completed",
    current_assignee_id: null,
    implemented_by: actor.id,
    implemented_at: now,
    updated_at: now
  }).eq("id", requestId).eq("status", "implementation_pending").eq("current_assignee_id", actor.id);
  if (error) go(`Talep tamamlanamadı: ${error.message}`, "error");
  revalidatePath(REQUEST_PATH);
  go("Talep uygulandı olarak işaretlendi.");
}
