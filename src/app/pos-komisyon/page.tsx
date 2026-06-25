import { PosCommissionCalculator } from "@/components/pos-commission-calculator";
import { requireUser } from "@/lib/auth/require-user";
import { resolvePosCommissionSettings } from "@/lib/pos-commission";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PosKomisyonPage() {
  await requireUser();

  const supabase = await createClient();
  const { data } = await supabase
    .from("pos_commission_settings")
    .select("id, commission_percent, updated_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const settings = resolvePosCommissionSettings(data);

  return (
    <main>
      <h1 className="page-title">POS Komisyon Hesaplayici</h1>
      <PosCommissionCalculator commissionPercent={settings.commissionPercent} />
    </main>
  );
}
