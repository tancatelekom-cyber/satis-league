import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatTariffDataGb } from "@/lib/tariffs";
import { TariffRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

type TariffDetailPageProps = {
  params: Promise<{
    tariffId: string;
  }>;
};

export default async function TariffDetailPage({ params }: TariffDetailPageProps) {
  const routeParams = await params;
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
    .eq("id", routeParams.tariffId)
    .eq("is_active", true)
    .maybeSingle();

  const tariff = (data as TariffRecord | null) ?? null;

  if (!tariff) {
    notFound();
  }

  return (
    <main>
      <div className="detail-page-head">
        <div>
          <Link className="back-link" href="/tarifeler">
            Tarifelere Don
          </Link>
          <h1 className="page-title compact-page-title">{tariff.name}</h1>
        </div>
      </div>

      <section className="guide-card tariff-detail-card">
        <div className="tariff-detail-badge-row">
          <span className="mission-pill">{tariff.provider}</span>
          <span className="mission-pill">{tariff.category_name}</span>
          <span className="mission-pill">Faturali Hat</span>
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
            <span>Aylik Fiyat</span>
            <strong>{Number(tariff.price ?? 0).toFixed(0)} TL</strong>
          </div>
        </div>

        <div className="step-list">
          <div className="step-item">
            <strong>Tarife Aciklamasi</strong>
            <span>{tariff.details ?? "Bu tarife icin detay girilmedi."}</span>
          </div>
          <div className="step-item">
            <strong>Kaynak</strong>
            <span>{tariff.source_url ?? "Kaynak baglantisi eklenmedi."}</span>
          </div>
          <div className="step-item">
            <strong>Son Guncelleme</strong>
            <span>{tariff.scraped_at ?? tariff.updated_at}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
