import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSetupNotice } from "@/components/admin/admin-setup-notice";
import {
  createTariffAction,
  deleteTariffAction,
  refreshTurkcellTariffsAction,
  updateTariffAction
} from "@/app/admin/actions";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/config";
import { TariffRecord } from "@/lib/types";

type AdminTariffsPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

export default async function AdminTariffsPage({ searchParams }: AdminTariffsPageProps) {
  const params = searchParams ? await searchParams : undefined;

  await requireAdminAccess();

  if (!isSupabaseAdminConfigured()) {
    return <AdminSetupNotice />;
  }

  const supabase = createAdminClient();
  const { data } = await supabase.from("tariffs").select("*").order("updated_at", { ascending: false });
  const tariffs = (data as TariffRecord[] | null) ?? [];
  const lastScrapedAt =
    tariffs
      .map((item) => item.scraped_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return (
    <main>
      <h1 className="page-title">Tarife Yonetimi</h1>
      <p className="page-subtitle">
        Turkcell tarifelerini buradan ekleyin, kategorilere ayirin ve kullanici tarafinda filtrelenebilir hale getirin.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <AdminSectionNav currentPath="/admin/tarifeler" />

      <section className="admin-overview-grid">
        <article className="admin-overview-card">
          <span>Toplam Tarife</span>
          <strong>{tariffs.length}</strong>
          <p>Kullaniciya gorunen aktif ve pasif kayitlarin toplam adedi.</p>
        </article>
        <article className="admin-overview-card">
          <span>Aktif Tarife</span>
          <strong>{tariffs.filter((item) => item.is_active).length}</strong>
          <p>Sadece aktif tarifeler kullanici menusu olan Tarifeler ekraninda listelenir.</p>
        </article>
        <article className="admin-overview-card">
          <span>Son Turkcell Cekimi</span>
          <strong>{lastScrapedAt ? new Date(lastScrapedAt).toLocaleString("tr-TR") : "Henuz cekilmedi"}</strong>
          <p>Guncel faturali hat tarifeleri Turkcell sayfasindan otomatik yenilenebilir.</p>
        </article>
      </section>

      <section className="admin-card">
        <h3>Turkcell'den Otomatik Guncelle</h3>
        <p>
          Online ya da dijitale ozel olmayan Turkcell faturali hat tarifelerini resmi sayfadan ceker,
          mevcut kayitlari gunceller ve artik sitede olmayanlari pasife alir.
        </p>
        <form action={refreshTurkcellTariffsAction} className="action-row">
          <input name="redirectTo" type="hidden" value="/admin/tarifeler" />
          <button className="button-primary" type="submit">
            Turkcell'den Simdi Cek
          </button>
        </form>
      </section>

      <section className="admin-card">
        <h3>Yeni Tarife Ekle</h3>
        <form action={createTariffAction} className="tariff-admin-form">
          <input name="redirectTo" type="hidden" value="/admin/tarifeler" />
          <label className="field">
            <span>Tarife Adi</span>
            <input name="name" placeholder="Ornek: 20 GB Maxi Paket" required />
          </label>
          <label className="field">
            <span>Kategori</span>
            <input name="category_name" placeholder="Ornek: Maxi / Platinum / Genclik" />
          </label>
          <label className="field">
            <span>Provider</span>
            <input defaultValue="Turkcell" name="provider" />
          </label>
          <label className="field">
            <span>Hat Tipi</span>
            <input defaultValue="faturali" name="line_type" />
          </label>
          <label className="field compact">
            <span>GB</span>
            <input defaultValue="0" min="0" name="data_gb" step="0.5" type="number" />
          </label>
          <label className="field compact">
            <span>Dakika</span>
            <input defaultValue="0" min="0" name="minutes" type="number" />
          </label>
          <label className="field compact">
            <span>SMS</span>
            <input defaultValue="0" min="0" name="sms" type="number" />
          </label>
          <label className="field compact">
            <span>Fiyat</span>
            <input defaultValue="0" min="0" name="price" step="0.01" type="number" />
          </label>
          <label className="field">
            <span>Kaynak URL</span>
            <input name="source_url" placeholder="https://www.turkcell.com.tr/..." />
          </label>
          <label className="field">
            <span>Son Cekilme Tarihi</span>
            <input name="scraped_at" type="datetime-local" />
          </label>
          <label className="field tariff-admin-field-wide">
            <span>Detay</span>
            <textarea name="details" placeholder="Tarifenin aciklamasi, ek kosullar, notlar..." rows={3} />
          </label>
          <label className="field-inline">
            <input defaultChecked name="is_active" type="checkbox" />
            <span>Aktif</span>
          </label>
          <label className="field-inline">
            <input name="is_online_only" type="checkbox" />
            <span>Online Ozel</span>
          </label>
          <label className="field-inline">
            <input name="is_digital_only" type="checkbox" />
            <span>Dijital Ozel</span>
          </label>
          <button className="button-primary tariff-admin-submit" type="submit">
            Tarifeyi Kaydet
          </button>
        </form>
      </section>

      <section className="admin-stack">
        {tariffs.map((tariff) => (
          <article key={tariff.id} className="admin-card">
            <form action={updateTariffAction} className="tariff-admin-form">
              <input name="redirectTo" type="hidden" value="/admin/tarifeler" />
              <input name="tariffId" type="hidden" value={tariff.id} />
              <label className="field">
                <span>Tarife Adi</span>
                <input defaultValue={tariff.name} name="name" required />
              </label>
              <label className="field">
                <span>Kategori</span>
                <input defaultValue={tariff.category_name} name="category_name" />
              </label>
              <label className="field">
                <span>Provider</span>
                <input defaultValue={tariff.provider} name="provider" />
              </label>
              <label className="field">
                <span>Hat Tipi</span>
                <input defaultValue={tariff.line_type} name="line_type" />
              </label>
              <label className="field compact">
                <span>GB</span>
                <input defaultValue={tariff.data_gb} min="0" name="data_gb" step="0.5" type="number" />
              </label>
              <label className="field compact">
                <span>Dakika</span>
                <input defaultValue={tariff.minutes} min="0" name="minutes" type="number" />
              </label>
              <label className="field compact">
                <span>SMS</span>
                <input defaultValue={tariff.sms} min="0" name="sms" type="number" />
              </label>
              <label className="field compact">
                <span>Fiyat</span>
                <input defaultValue={tariff.price} min="0" name="price" step="0.01" type="number" />
              </label>
              <label className="field">
                <span>Kaynak URL</span>
                <input defaultValue={tariff.source_url ?? ""} name="source_url" />
              </label>
              <label className="field">
                <span>Son Cekilme Tarihi</span>
                <input
                  defaultValue={tariff.scraped_at ? tariff.scraped_at.slice(0, 16) : ""}
                  name="scraped_at"
                  type="datetime-local"
                />
              </label>
              <label className="field tariff-admin-field-wide">
                <span>Detay</span>
                <textarea defaultValue={tariff.details ?? ""} name="details" rows={3} />
              </label>
              <label className="field-inline">
                <input defaultChecked={tariff.is_active} name="is_active" type="checkbox" />
                <span>Aktif</span>
              </label>
              <label className="field-inline">
                <input defaultChecked={tariff.is_online_only} name="is_online_only" type="checkbox" />
                <span>Online Ozel</span>
              </label>
              <label className="field-inline">
                <input defaultChecked={tariff.is_digital_only} name="is_digital_only" type="checkbox" />
                <span>Dijital Ozel</span>
              </label>
              <div className="action-row tariff-admin-actions">
                <button className="button-primary" type="submit">
                  Guncelle
                </button>
              </div>
            </form>
            <form action={deleteTariffAction}>
              <input name="redirectTo" type="hidden" value="/admin/tarifeler" />
              <input name="tariffId" type="hidden" value={tariff.id} />
              <button className="button-secondary" type="submit">
                Sil
              </button>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}
