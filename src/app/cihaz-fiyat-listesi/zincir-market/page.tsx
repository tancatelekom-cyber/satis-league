import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { fetchDevicePriceRows } from "@/lib/device-price-list";
import { groupDevicePrices } from "@/lib/device-price-search";
import { isSmartphoneCategory } from "@/lib/market-comparison";
import { MarketComparison, type ComparisonPhone } from "@/components/market-comparison";
export const dynamic = "force-dynamic";
export default async function MarketComparisonPage() {
  const user = await requireUser();
  const client = await createClient();
  const { data: profile } = await client.from("profiles").select("approval").eq("id", user.id).single();
  if (profile?.approval !== "approved") redirect("/hesabim");
  let phones: ComparisonPhone[] = [], error = "";
  try {
    const rows = await fetchDevicePriceRows();
    phones = groupDevicePrices(rows.filter(row => isSmartphoneCategory(row.category))).map(group => ({ key: group.key, name: group.product.productName, brand: group.product.brand, pk: group.price }));
  } catch { error = "PK fiyat listesi şu anda okunamıyor. Lütfen sayfayı yenileyin."; }
  return <main className="goal-page"><h1 className="page-title">Zincir Market Karşılaştırması</h1><p className="page-subtitle">Akıllı telefonların PK fiyatlarını MediaMarkt, Vatan Bilgisayar ve Turkcell Pasaj ile karşılaştırın.</p>
    <div className="goal-mode-row"><Link className="goal-mode-button" href="/cihaz-fiyat-listesi">Cihaz Fiyat Listesi</Link><span className="goal-mode-button goal-mode-button-active">Zincir Market Karşılaştırması</span></div>
    {error ? <p role="alert">{error}</p> : <MarketComparison phones={phones} />}
  </main>;
}
