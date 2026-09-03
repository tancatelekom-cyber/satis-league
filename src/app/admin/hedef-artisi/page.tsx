import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import {
  GoalTargetAdjustmentForm,
  type GoalTargetAdjustmentFormRow
} from "@/components/admin/goal-target-adjustment-form";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { fetchGoalStoreRows, getIstanbulPeriodMonth } from "@/lib/goal-actuals";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";

type Props = { searchParams?: Promise<{ message?: string; type?: "success" | "error"; month?: string }> };

export default async function GoalTargetAdjustmentAdminPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : undefined;
  await requireAdminAccess();
  if (!isSupabaseAdminConfigured()) return <AdminSetupNotice />;

  const selectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(params?.month ?? "")
    ? String(params?.month)
    : getIstanbulPeriodMonth();
  const rawRows = await fetchGoalStoreRows();
  const storeCategoryMap = new Map<string, Map<string, number>>();

  rawRows.forEach((row) => {
    if (!row.target || row.target <= 0 || row.targetIsPercent || row.separateInfo) return;
    const categoryMap = storeCategoryMap.get(row.storeCode) ?? new Map<string, number>();
    categoryMap.set(row.mainCategory, (categoryMap.get(row.mainCategory) ?? 0) + row.target);
    storeCategoryMap.set(row.storeCode, categoryMap);
  });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("goal_store_target_adjustments")
    .select("store_code, category_name, increase_percent")
    .eq("period_month", `${selectedMonth}-01`);
  const adjustmentMap = new Map(
    (data ?? []).map((row) => [`${row.store_code}__${row.category_name}`, Number(row.increase_percent)] as const)
  );
  const stores = Array.from(storeCategoryMap.entries())
    .map(([storeCode, categoryMap]) => ({
      storeCode,
      rows: Array.from(categoryMap.entries())
        .map(([categoryName, rawTarget]): GoalTargetAdjustmentFormRow => ({
          categoryName,
          rawTarget,
          increasePercent: adjustmentMap.get(`${storeCode}__${categoryName}`) ?? 0
        }))
        .sort((left, right) => left.categoryName.localeCompare(right.categoryName, "tr"))
    }))
    .sort((left, right) => left.storeCode.localeCompare(right.storeCode, "tr"));

  return (
    <main>
      <h1 className="page-title">Şube Kategori Hedef Artışları</h1>
      <p className="page-subtitle">
        Firma hedefini değiştirmeden, şube hedeflerine kategori bazında aylık artış oranı uygulayın.
      </p>
      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>{params.message}</div>
      ) : null}
      <AdminSectionNav currentPath="/admin/hedef-artisi" />
      {error ? (
        <div className="message-box error-box">
          Hedef artış tablosu bulunamadı. Önce supabase/schema.sql değişikliklerini uygulayın: {error.message}
        </div>
      ) : null}

      <section className="admin-card goal-target-adjustment-control">
        <div>
          <strong>Hesaplama kuralı</strong>
          <p>Ham hedef × artış oranı hesaplanır ve sonuç her zaman yukarı yuvarlanır.</p>
          <small>Örnek: 100 hedef + %9,8 = 109,8 → şube ekranında 110 hedef gösterilir.</small>
        </div>
        <form method="get" className="admin-form">
          <label className="field">
            <span>İşlem yapılacak ay</span>
            <input className="input" name="month" type="month" defaultValue={selectedMonth} />
          </label>
          <button className="button-secondary" type="submit">Ayı Göster</button>
        </form>
      </section>

      <div className="goal-target-adjustment-store-list">
        {stores.map((store) => (
          <section className="admin-card goal-target-adjustment-store" key={store.storeCode}>
            <header>
              <div><span>ŞUBE</span><h2>{store.storeCode}</h2></div>
              <b>{store.rows.length} kategori</b>
            </header>
            <GoalTargetAdjustmentForm
              periodMonth={selectedMonth}
              storeCode={store.storeCode}
              rows={store.rows}
            />
          </section>
        ))}
      </div>
    </main>
  );
}
