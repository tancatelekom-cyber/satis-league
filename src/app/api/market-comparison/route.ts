import { createClient } from "@/lib/supabase/server";
import { fetchDevicePriceRows } from "@/lib/device-price-list";
import { groupDevicePrices } from "@/lib/device-price-search";
import { fetchMarketPrice, isSmartphoneCategory, RETAILERS } from "@/lib/market-comparison";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return Response.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const { data: profile } = await client.from("profiles").select("approval").eq("id", user.id).single();
  if (profile?.approval !== "approved") return Response.json({ error: "Erişim yetkiniz yok." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.key !== "string" || body.key.length > 1000) return Response.json({ error: "Telefon seçin." }, { status: 400 });
  try {
    const rows = await fetchDevicePriceRows();
    const group = groupDevicePrices(rows.filter(row => isSmartphoneCategory(row.category))).find(item => item.key === body.key);
    if (!group) return Response.json({ error: "Telefon güncel fiyat listesinde bulunamadı. Sayfayı yenileyin." }, { status: 404 });
    const results = await Promise.all(RETAILERS.map(retailer => fetchMarketPrice(retailer, group.product.productName, group.product.brand)));
    return Response.json({ key: group.key, pk: group.price, checkedAt: new Date().toISOString(), results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Güncel PK fiyat listesi okunamadı. Lütfen tekrar deneyin." }, { status: 502 }); }
}
