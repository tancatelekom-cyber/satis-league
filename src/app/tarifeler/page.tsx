import Link from "next/link";
import { redirect } from "next/navigation";
import { FilterSelectNav } from "@/components/ui/filter-select-nav";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildTariffFilterOptions,
  filterTariffs,
  formatTariffDataGb,
  getTariffPresetLabel
} from "@/lib/tariffs";
import { TariffCategoryMode, TariffPreset, TariffRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

type TariffsPageProps = {
  searchParams?: Promise<{
    mode?: TariffCategoryMode;
    preset?: TariffPreset;
    bucket?: string;
    search?: string;
  }>;
};

function buildHref(mode: TariffCategoryMode, preset: TariffPreset, bucket?: string, search?: string) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (preset !== "all") params.set("preset", preset);
  if (bucket) params.set("bucket", bucket);
  if (search) params.set("search", search);
  return `/tarifeler?${params.toString()}`;
}

export default async function TariffsPage({ searchParams }: TariffsPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const selectedMode = params?.mode === "minutes" || params?.mode === "name" ? params.mode : "gb";
  const selectedPreset: TariffPreset =
    params?.preset === "new-member" ||
    params?.preset === "emekli" ||
    params?.preset === "emek" ||
    params?.preset === "platinum" ||
    params?.preset === "gnc" ||
    params?.preset === "general-postpaid"
      ? params.preset
      : "all";
  const selectedBucket = String(params?.bucket ?? "").trim();
  const search = String(params?.search ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: profile } = await supabase.from("profiles").select("approval").eq("id", user.id).single();

  if (!profile || profile.approval !== "approved") {
    redirect("/hesabim");
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("tariffs")
    .select("*")
    .eq("is_active", true)
    .eq("provider", "Turkcell")
    .eq("line_type", "faturali")
    .eq("is_online_only", false)
    .eq("is_digital_only", false)
    .order("price");

  const tariffs = (data as TariffRecord[] | null) ?? [];
  const filterOptions = buildTariffFilterOptions(tariffs, selectedMode);
  const filteredTariffs = filterTariffs(tariffs, selectedMode, selectedPreset, selectedBucket, search);

  return (
    <main>
      <h1 className="page-title">Tarifeler</h1>
      <p className="page-subtitle">
        Turkcell faturalı tarifeleri GB, dakika veya isim grubuna göre filtreleyin, detayını açın.
      </p>

      <section className="guide-card game-brief-card">
        <div className="league-filter-grid">
          <div className="league-filter-item">
            <span className="league-filter-label">Hazir Baslik</span>
            <FilterSelectNav
              ariaLabel="Hazir tarife basligi secimi"
              value={buildHref(selectedMode, selectedPreset, selectedBucket, search)}
              options={[
                { value: buildHref(selectedMode, "all", "", search), label: "Tum Basliklar" },
                { value: buildHref(selectedMode, "new-member", "", search), label: "Yeni Musteriye Ozel" },
                { value: buildHref(selectedMode, "emekli", "", search), label: "Emekli" },
                { value: buildHref(selectedMode, "emek", "", search), label: "Emek" },
                { value: buildHref(selectedMode, "platinum", "", search), label: "Platinum" },
                { value: buildHref(selectedMode, "gnc", "", search), label: "GNC" },
                { value: buildHref(selectedMode, "general-postpaid", "", search), label: "Genel Faturali" }
              ]}
            />
          </div>

          <div className="league-filter-item">
            <span className="league-filter-label">Kategori</span>
            <FilterSelectNav
              ariaLabel="Tarife kategori secimi"
              value={buildHref(selectedMode, selectedPreset, selectedBucket, search)}
              options={[
                { value: buildHref("gb", selectedPreset, "", search), label: "GB Gruplari" },
                { value: buildHref("minutes", selectedPreset, "", search), label: "Dakika Gruplari" },
                { value: buildHref("name", selectedPreset, "", search), label: "Tarife Gruplari" }
              ]}
            />
          </div>

          <div className="league-filter-item league-filter-item-wide">
            <span className="league-filter-label">Filtre</span>
            <FilterSelectNav
              ariaLabel="Tarife filtre secimi"
              value={buildHref(selectedMode, selectedPreset, selectedBucket, search)}
              options={[
                { value: buildHref(selectedMode, selectedPreset, "", search), label: "Tum Tarifeler" },
                ...filterOptions.map((option) => ({
                  value: buildHref(selectedMode, selectedPreset, option.value, search),
                  label: option.label
                }))
              ]}
            />
          </div>
        </div>

        {selectedPreset !== "all" ? (
          <div className="tariff-active-preset">
            <strong>{getTariffPresetLabel(selectedPreset)}</strong>
            <span>hazir basligi aktif. Isterseniz alttan farkli grup ve arama ile daraltabilirsiniz.</span>
          </div>
        ) : null}

        <form className="tariff-search-row" action="/tarifeler" method="get">
          <input name="mode" type="hidden" value={selectedMode} />
          <input name="preset" type="hidden" value={selectedPreset} />
          {selectedBucket ? <input name="bucket" type="hidden" value={selectedBucket} /> : null}
          <input
            className="input"
            defaultValue={search}
            name="search"
            placeholder="Tarife adina gore ara"
            type="search"
          />
          <button className="button-secondary" type="submit">
            Filtrele
          </button>
        </form>
      </section>

      <section className="campaign-directory">
        {filteredTariffs.length === 0 ? (
          <article className="campaign-directory-card">
            <strong>Tarife bulunamadi</strong>
            <p className="subtle">Seciminize uygun tarife yok. Farkli bir grup veya arama deneyin.</p>
          </article>
        ) : (
          filteredTariffs.map((tariff) => (
            <Link key={tariff.id} className="tariff-card" href={`/tarifeler/${tariff.id}`}>
              <div className="tariff-card-head">
                <strong>{tariff.name}</strong>
                <span className="badge">{tariff.category_name}</span>
              </div>
              <div className="tariff-card-grid">
                <div className="tariff-stat">
                  <span>Internet</span>
                  <strong>{formatTariffDataGb(Number(tariff.data_gb ?? 0))}</strong>
                </div>
                <div className="tariff-stat">
                  <span>Dakika</span>
                  <strong>{Number(tariff.minutes ?? 0)} DK</strong>
                </div>
                <div className="tariff-stat">
                  <span>SMS</span>
                  <strong>{Number(tariff.sms ?? 0)}</strong>
                </div>
                <div className="tariff-stat">
                  <span>Fiyat</span>
                  <strong>{Number(tariff.price ?? 0).toFixed(0)} TL</strong>
                </div>
              </div>
              <p className="subtle">{tariff.details ?? "Detaya girerek tarife bilgisini inceleyin."}</p>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
