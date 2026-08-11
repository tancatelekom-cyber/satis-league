import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { fetchGoalStoreRows, getIstanbulPeriodMonth } from "@/lib/goal-actuals";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";
import { saveGoalFullAchievementAction } from "./actions";

type Props = { searchParams?: Promise<{ message?: string; type?: "success" | "error"; month?: string }> };

export default async function GoalFullAchievementAdminPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : undefined;
  await requireAdminAccess();
  if (!isSupabaseAdminConfigured()) return <AdminSetupNotice />;

  const selectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(params?.month ?? "")
    ? String(params?.month)
    : getIstanbulPeriodMonth();
  const rows = await fetchGoalStoreRows();
  const stores = Array.from(new Set(rows.map((row) => row.storeCode))).sort((a, b) => a.localeCompare(b, "tr"));
  const categories = Array.from(new Set(rows.map((row) => row.mainCategory)))
    .filter((value) => value.trim())
    .sort((a, b) => a.localeCompare(b, "tr"));
  const { data, error } = await createAdminClient()
    .from("goal_store_full_achievement_overrides")
    .select("store_code, category_name")
    .eq("period_month", `${selectedMonth}-01`);
  const selected = new Set((data ?? []).map((row) => `${row.store_code}__${row.category_name}`));

  return (
    <main>
      <h1 className="page-title">Şube Hedefini %100 Say</h1>
      <p className="page-subtitle">
        Dönemsel kapanan şubelerde seçtiğiniz kategorilerin hedefi mevcut gerçekleşene eşitlenir; ay sonu gerçekleşen değeri korunur ve gidişat %100 gösterilir.
      </p>
      {params?.message ? <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>{params.message}</div> : null}
      <AdminSectionNav currentPath="/admin/hedef-yuzde-yuz" />
      {error ? <div className="message-box error-box">Ayar tablosu bulunamadı. Önce supabase/schema.sql değişikliklerini uygulayın: {error.message}</div> : null}

      <section className="admin-card">
        <form method="get" className="admin-form">
          <label className="field"><span>İşlem yapılacak ay</span><input className="input" name="month" type="month" defaultValue={selectedMonth} /></label>
          <button className="button-secondary" type="submit">Ayı Göster</button>
        </form>
      </section>

      <div className="admin-grid">
        {stores.map((storeCode) => (
          <section className="admin-card" key={storeCode}>
            <h3>{storeCode}</h3>
            <p>%100 kabul edilecek kategorileri seçin. Seçimi kaldırıp kaydetmek ayarı iptal eder.</p>
            <form action={saveGoalFullAchievementAction} className="admin-form">
              <input type="hidden" name="periodMonth" value={selectedMonth} />
              <input type="hidden" name="storeCode" value={storeCode} />
              <div className="checkbox-grid permission-checkbox-grid">
                {categories.map((category) => (
                  <label className="field-inline" key={category}>
                    <input name="categories" type="checkbox" value={category} defaultChecked={selected.has(`${storeCode}__${category}`)} />
                    <span>{category}</span>
                  </label>
                ))}
              </div>
              <button className="button-primary" type="submit">Şube Ayarını Kaydet</button>
            </form>
          </section>
        ))}
      </div>
    </main>
  );
}
