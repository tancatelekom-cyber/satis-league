import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { LastDayCounterShareButton } from "@/components/last-day-counter-share-button";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCounterStoreName, getLastDayCounters } from "@/lib/last-day-counters";
import {
  createLastDayCounterAction,
  adjustLastDayCounterAction,
  deleteLastDayCounterAction,
  toggleLastDayCounterVisibilityAction
} from "./actions";

type PageProps = { searchParams?: Promise<{ message?: string; type?: string }> };

export default async function LastDayCounterAdminPage({ searchParams }: PageProps) {
  await requireAdminAccess();
  const params = (await searchParams) ?? {};
  const admin = createAdminClient();
  const [{ data: stores }, counters] = await Promise.all([
    admin.from("stores").select("id, name").eq("is_active", true).order("name"),
    getLastDayCounters()
  ]);

  return (
    <main className="admin-center-page">
      <section className="admin-center-hero">
        <span className="admin-center-hero-icon" aria-hidden="true">⏳</span>
        <div>
          <span className="admin-center-eyebrow">OPERASYON KONTROLÜ</span>
          <h1 className="page-title">Son Gün Sayaç</h1>
          <p className="page-subtitle">Firma veya mağaza bazlı kalan işleri yönetin.</p>
        </div>
      </section>

      {params.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>{params.message}</div>
      ) : null}

      {counters.length ? (
        <div className="admin-counter-share-row">
          <LastDayCounterShareButton counters={counters.map((counter) => ({
            category: counter.category_name,
            scope: counter.scope === "company" ? "Firma" : getCounterStoreName(counter),
            remaining: counter.remaining_count
          }))} />
        </div>
      ) : null}

      <section className="admin-counter-create-card">
        <h2>Yeni kategori ekle</h2>
        <form action={createLastDayCounterAction} className="admin-counter-create-form">
          <label>Kategori adı<input name="categoryName" required placeholder="Örn. Bekleyen aktivasyon" /></label>
          <label>Kapsam<select name="scope" required><option value="company">Firma</option><option value="store">Mağaza</option></select></label>
          <label>Mağaza<select name="storeId"><option value="">Firma kapsamında kullanılmaz</option>{(stores ?? []).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
          <label>Güncel kalan sayı<input name="remainingCount" type="number" min="0" step="1" required /></label>
          <label className="admin-counter-checkbox"><input name="showOnHome" type="checkbox" defaultChecked />Ana ekranda göster</label>
          <button className="button-primary" type="submit">Sayaç ekle</button>
        </form>
      </section>

      <section className="admin-counter-grid">
        {counters.map((counter) => {
          const completed = counter.remaining_count <= 0;
          return (
            <article className={`admin-counter-card${completed ? " completed" : ""}`} key={counter.id}>
              <span>{counter.scope === "company" ? "Firma" : getCounterStoreName(counter)}</span>
              <h2>{counter.category_name}</h2>
              {completed ? <div className="admin-counter-check">✓</div> : <strong>{counter.remaining_count.toLocaleString("tr-TR")}</strong>}
              <p>{completed ? "Tamamlandı" : "Güncel kalan"}</p>
              <form action={toggleLastDayCounterVisibilityAction} className="admin-counter-visibility-form">
                <input name="counterId" type="hidden" value={counter.id} />
                <input name="showOnHome" type="hidden" value={counter.show_on_home ? "false" : "true"} />
                <button type="submit">{counter.show_on_home ? "Ana ekrandan gizle" : "Ana ekranda göster"}</button>
              </form>
              <div className="admin-counter-adjust">
                <form action={adjustLastDayCounterAction}>
                  <input name="counterId" type="hidden" value={counter.id} />
                  <input name="adjustment" type="hidden" value="-1" />
                  <button aria-label="Sayacı bir azalt" disabled={completed} type="submit">−</button>
                </form>
                <span>{counter.remaining_count.toLocaleString("tr-TR")}</span>
                <form action={adjustLastDayCounterAction}>
                  <input name="counterId" type="hidden" value={counter.id} />
                  <input name="adjustment" type="hidden" value="1" />
                  <button aria-label="Sayacı bir artır" type="submit">+</button>
                </form>
              </div>
              <form action={deleteLastDayCounterAction}>
                <input name="counterId" type="hidden" value={counter.id} />
                <button className="admin-counter-delete" type="submit">Sayacı sil</button>
              </form>
            </article>
          );
        })}
      </section>
      <AdminSectionNav currentPath="/admin/son-gun-sayac" />
    </main>
  );
}
