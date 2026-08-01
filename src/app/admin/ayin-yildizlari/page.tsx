import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateHomeLeaderPeriodAction } from "./actions";

type PageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

const MONTH_LABELS = [
  "Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran",
  "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik"
];

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(monthKey: string) {
  const year = Number(monthKey.slice(0, 4));
  const monthIndex = Number(monthKey.slice(5, 7)) - 1;
  return `${MONTH_LABELS[monthIndex] ?? ""} ${year}`.trim();
}

export default async function AdminHomeLeaderPeriodPage({ searchParams }: PageProps) {
  await requireAdminAccess();

  const params = searchParams ? await searchParams : undefined;
  const admin = createAdminClient();
  const { data } = await admin
    .from("home_leader_settings")
    .select("display_month, updated_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const configuredMonth = String(data?.display_month ?? "").slice(0, 7);
  const displayMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(configuredMonth)
    ? configuredMonth
    : currentMonthKey();

  return (
    <main>
      <h1 className="page-title">Ayın Yıldızları Dönemi</h1>
      <p className="page-subtitle">
        Ana ekrandaki satış liderlerinin hangi yıl ve aya göre hesaplanacağını seçin.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <AdminSectionNav currentPath="/admin/ayin-yildizlari" />

      <section className="guide-card game-brief-card">
        <div className="section-title compact-title">
          <div>
            <span>ANA EKRANDA GÖSTERİLEN DÖNEM</span>
            <h2>{formatMonth(displayMonth)}</h2>
            <p>Aktif sezonların liderleri seçilen ay içindeki satışlardan hesaplanır.</p>
          </div>
        </div>

        <form action={updateHomeLeaderPeriodAction} className="admin-form">
          <label className="field">
            <span>Yıl ve Ay</span>
            <input
              className="input"
              name="displayMonth"
              type="month"
              defaultValue={displayMonth}
              required
            />
          </label>

          <button className="button-primary" type="submit">
            Dönemi Kaydet
          </button>
        </form>
      </section>
    </main>
  );
}
